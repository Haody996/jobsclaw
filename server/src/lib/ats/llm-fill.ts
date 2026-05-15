import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

interface FormField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'radio'
  options?: string[]
}

interface FillAction {
  id: string
  value: string
}

// Extract unfilled form fields from the page DOM
async function extractUnfilledFields(page: any): Promise<FormField[]> {
  return page.evaluate(() => {
    const fields: any[] = []
    const seenNames = new Set<string>()

    document.querySelectorAll<HTMLLabelElement>('label').forEach((label) => {
      const text = label.innerText.trim().replace(/\s*\*\s*$/, '')
      if (!text || text.length > 150) return

      const forId = label.htmlFor
      const input: HTMLElement | null = forId
        ? document.getElementById(forId)
        : label.querySelector('input, textarea, select')

      if (!input) return

      const tag = input.tagName.toLowerCase()
      const inputType = (input as HTMLInputElement).type?.toLowerCase() || 'text'

      if (['hidden', 'submit', 'file', 'button', 'email', 'password'].includes(inputType)) return

      // Skip already-filled fields
      const currentVal = (input as HTMLInputElement).value?.trim()
      if (currentVal && currentVal !== '0' && currentVal !== 'false') return

      const fieldId = forId || (input as HTMLInputElement).name || text.slice(0, 30)
      if (seenNames.has(fieldId)) return
      seenNames.add(fieldId)

      if (tag === 'select') {
        const opts = Array.from((input as HTMLSelectElement).options)
          .map((o) => o.text.trim())
          .filter((o) => o && !/^(select|choose|--)/i.test(o))
        fields.push({ id: fieldId, label: text, type: 'select', options: opts })
      } else if (tag === 'textarea') {
        fields.push({ id: fieldId, label: text, type: 'textarea' })
      } else if (inputType === 'radio') {
        const name = (input as HTMLInputElement).name
        if (seenNames.has(`radio:${name}`)) return
        seenNames.add(`radio:${name}`)
        const opts = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
          .map((r) => document.querySelector<HTMLLabelElement>(`label[for="${r.id}"]`)?.innerText.trim() || r.value)
          .filter(Boolean)
        fields.push({ id: `radio:${name}`, label: text, type: 'radio', options: opts })
      } else {
        fields.push({ id: fieldId, label: text, type: 'text' })
      }
    })

    return fields
  })
}

// Fill a field by its id/name attribute or label text
async function applyFill(page: any, field: FormField, value: string): Promise<void> {
  if (!value) return
  const cleanId = field.id.startsWith('radio:') ? field.id.slice(6) : field.id

  if (field.type === 'select') {
    try {
      const sel = `select[id="${cleanId}"], select[name="${cleanId}"]`
      const loc = page.locator(sel).first()
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
        // Try exact label match first, then partial
        const options: string[] = await loc.locator('option').allInnerTexts()
        const match = options.find((o) => o.toLowerCase() === value.toLowerCase())
          || options.find((o) => o.toLowerCase().includes(value.toLowerCase()))
        if (match) await loc.selectOption({ label: match.trim() })
      }
    } catch { /* skip */ }
  } else if (field.type === 'radio') {
    try {
      const radios = page.locator(`input[name="${cleanId}"]`)
      const count = await radios.count()
      for (let i = 0; i < count; i++) {
        const radio = radios.nth(i)
        const radioId = await radio.getAttribute('id').catch(() => '')
        const label = radioId
          ? await page.locator(`label[for="${radioId}"]`).innerText().catch(() => '')
          : ''
        if (label.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(label.toLowerCase())) {
          await radio.check({ timeout: 2000 }).catch(() => null)
          break
        }
      }
    } catch { /* skip */ }
  } else {
    // text / textarea — find by id, name, or label text
    const selectors = [
      `[id="${cleanId}"]`,
      `[name="${cleanId}"]`,
    ]
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first()
        if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
          await loc.fill(value)
          return
        }
      } catch { /* try next */ }
    }
    // Fallback: find by label text in DOM
    try {
      const labels = await page.$$('label')
      for (const label of labels) {
        const text = await label.innerText().catch(() => '')
        if (text.trim().replace(/\s*\*$/, '') === field.label) {
          const forAttr = await label.getAttribute('for').catch(() => '')
          if (forAttr) {
            const loc = page.locator(`#${forAttr}`).first()
            if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
              await loc.fill(value)
              return
            }
          }
        }
      }
    } catch { /* skip */ }
  }
}

export async function fillCustomQuestionsWithLLM(
  page: any,
  profile: {
    firstName: string; lastName: string; city?: string | null; state?: string | null
    resumeText?: string | null; bio?: string | null
  },
  email: string,
  answers: { question: string; answer: string }[]
): Promise<void> {
  const fields = await extractUnfilledFields(page)
  console.log(`[llm-fill] extracted ${fields.length} unfilled field(s):`, fields.map((f) => `"${f.label}"(${f.type})`).join(', ') || '(none)')
  if (fields.length === 0) return

  // Skip obviously standard fields that adapters already handle
  const customFields = fields.filter((f) => {
    const l = f.label.toLowerCase()
    return !/(^first.?name|^last.?name|^full.?name|^email|^phone|^resume|^cv|^linkedin|^portfolio|^website|^github|^city|^state|^zip|^postal|^address|^country)/.test(l)
  })
  console.log(`[llm-fill] ${customFields.length} custom field(s) to fill via LLM:`, customFields.map((f) => `"${f.label}"`).join(', ') || '(none)')
  if (customFields.length === 0) return

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING },
            value: { type: SchemaType.STRING },
          },
          required: ['id', 'value'],
        },
      },
    },
    systemInstruction: `You fill job application form fields for a candidate.
Return concise, professional answers. For yes/no questions about work authorization or sponsorship,
respond with what would be on the relevant option. Return empty string "" for fields you cannot answer.`,
  })

  const prompt = `Candidate:
Name: ${profile.firstName} ${profile.lastName}
Email: ${email}
Location: ${[profile.city, profile.state].filter(Boolean).join(', ') || 'N/A'}
${profile.bio ? `Bio: ${profile.bio.slice(0, 400)}` : ''}
${profile.resumeText ? `Resume: ${profile.resumeText.slice(0, 2000)}` : ''}

Saved answers:
${answers.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n') || 'None'}

Form fields to fill:
${JSON.stringify(customFields, null, 2)}`

  if (!process.env.GEMINI_API_KEY) {
    console.error('[llm-fill] GEMINI_API_KEY not set — skipping custom-question fill for', customFields.length, 'field(s)')
    return
  }

  let rawResponse: string | null = null
  try {
    const result = await model.generateContent(prompt)
    rawResponse = result.response.text()
    const actions = JSON.parse(rawResponse) as FillAction[]
    console.log(`[llm-fill] LLM returned ${actions.length} fill action(s):`,
      actions.map((a) => `"${a.id}"="${a.value?.slice(0, 40) ?? ''}"`)
    )
    for (const action of actions) {
      if (!action.value) continue
      const field = customFields.find((f) => f.id === action.id)
      if (field) {
        console.log(`[llm-fill] filling "${field.label}" → "${action.value.slice(0, 60)}"`)
        await applyFill(page, field, action.value)
      }
    }
  } catch (err: any) {
    console.error('[llm-fill] ERROR — custom question fill failed:')
    console.error('[llm-fill]   message:', err?.message || err)
    if (err?.status) console.error('[llm-fill]   status:', err.status)
    if (err?.errorDetails) console.error('[llm-fill]   errorDetails:', JSON.stringify(err.errorDetails))
    if (rawResponse) console.error('[llm-fill]   rawResponse (first 500 chars):', rawResponse.slice(0, 500))
    if (err?.stack) console.error('[llm-fill]   stack:', err.stack)
  }
}
