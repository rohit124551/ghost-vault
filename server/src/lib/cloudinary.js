const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Multer storage for screenshots (owner uploads)
 */
const screenshotStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'snapvault/screenshots',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
    resource_type: 'image',
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
  },
});

/**
 * Multer storage for room guest uploads (files, images, etc.)
 */
const roomFileStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: `snapvault/rooms/${req.params.token}`,
    resource_type: 'auto',
  }),
});

const screenshotUpload = multer({
  storage: screenshotStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for owner
});

const roomFileUpload = multer({
  storage: roomFileStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for guests
});

/**
 * Delete an asset from Cloudinary by public_id
 */
async function deleteFromCloudinary(publicId, resourceType = 'image') {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('Cloudinary delete error:', err.message);
  }
}

module.exports = { cloudinary, screenshotUpload, roomFileUpload, deleteFromCloudinary };
