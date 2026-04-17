const express = require("express");
const multer = require("multer");
const { uploadDocument, listDocuments, deleteDocument } = require("../controllers/upload.controller");

const router = express.Router();

const MAX_SIZE_MB = parseInt(process.env.UPLOAD_MAX_FILE_SIZE_MB) || 20;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(Object.assign(new Error("Only PDF files are accepted."), { statusCode: 400, code: "INVALID_FILE_TYPE" }), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

const handleMulterError = (err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, error: "FILE_TOO_LARGE", message: `File exceeds the ${MAX_SIZE_MB}MB limit.` });
  }
  if (err.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({ success: false, error: "INVALID_FILE_TYPE", message: err.message });
  }
  next(err);
};

router.post("/upload", upload.single("file"), handleMulterError, uploadDocument);
router.get("/documents", listDocuments);
router.delete("/documents/:documentId", deleteDocument);

module.exports = router;
