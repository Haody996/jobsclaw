import multer from 'multer'
import path from 'path'
import fs from 'fs'

const uploadDir = process.env.UPLOAD_DIR || './uploads'

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req: any, file, cb) => {
    const userId = req.userId || 'unknown'
    const ext = path.extname(file.originalname)
    cb(null, `${userId}${ext}`)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'))
      return
    }
    cb(null, true)
  },
})
