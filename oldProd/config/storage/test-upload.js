const fs = require('fs');
const path = require('path');
const { containerClient, generateSignedUrl } = require('./storage');

// Path to your local image file
const localFilePath = path.join(__dirname, 'image', 'cc_logo_raw.png'); // replace with your actual path
const blobName = `upload-${Date.now()}-${path.basename(localFilePath)}`;

async function uploadTestImage() {
  try {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const fileBuffer = fs.readFileSync(localFilePath);

    await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });

    const signedUrl = generateSignedUrl(blobName);
    console.log('✅ Upload successful!');
    console.log('🔗 Image URL:', signedUrl);
  } catch (err) {
    console.error('❌ Upload failed:', err.message);
  }
}

uploadTestImage();
