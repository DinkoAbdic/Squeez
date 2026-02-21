import Jimp from 'jimp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRAND_COLOR = 0xf15d22ff; // #f15d22

function write24BitBmp(image) {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const rowBytes = width * 3;
    const padding = (4 - (rowBytes % 4)) % 4;
    const paddedRowBytes = rowBytes + padding;
    const pixelArraySize = paddedRowBytes * height;
    const fileSize = 54 + pixelArraySize;

    const buf = Buffer.alloc(fileSize);

    // File header (14 bytes)
    buf.write('BM', 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(0, 6);
    buf.writeUInt32LE(54, 10);

    // DIB header (40 bytes)
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(24, 28);
    buf.writeUInt32LE(0, 30);
    buf.writeUInt32LE(pixelArraySize, 34);
    buf.writeInt32LE(2835, 38);
    buf.writeInt32LE(2835, 42);
    buf.writeUInt32LE(0, 46);
    buf.writeUInt32LE(0, 50);

    for (let y = 0; y < height; y++) {
        const srcY = height - 1 - y;
        for (let x = 0; x < width; x++) {
            const idx = (srcY * width + x) << 2;
            const r = image.bitmap.data[idx];
            const g = image.bitmap.data[idx + 1];
            const b = image.bitmap.data[idx + 2];
            const pos = 54 + y * paddedRowBytes + x * 3;
            buf.writeUInt8(b, pos);
            buf.writeUInt8(g, pos + 1);
            buf.writeUInt8(r, pos + 2);
        }
    }
    return buf;
}

async function generate() {
    const logoPath = path.join(__dirname, '../public/app-icon.png');
    let logo;
    try {
        logo = await Jimp.read(logoPath);
    } catch (e) {
        console.error("Could not read logo", e);
        process.exit(1);
    }

    // Generate sidebar 164x314
    const sidebar = new Jimp(164, 314, BRAND_COLOR);
    const logoSidebar = logo.clone().resize(100, Jimp.AUTO);
    sidebar.composite(logoSidebar, (164 - 100) / 2, (314 - logoSidebar.bitmap.height) / 2);
    const sidebarBmp = write24BitBmp(sidebar);
    fs.writeFileSync(path.join(__dirname, '../src-tauri/icons/nsis-sidebar.bmp'), sidebarBmp);

    // Generate header 150x57
    const headerBg = new Jimp(150, 57, BRAND_COLOR);
    const logoHeader = logo.clone().resize(Jimp.AUTO, 40);
    headerBg.composite(logoHeader, 150 - logoHeader.bitmap.width - 8, (57 - 40) / 2);

    const headerBmp = write24BitBmp(headerBg);
    fs.writeFileSync(path.join(__dirname, '../src-tauri/icons/nsis-header.bmp'), headerBmp);

    console.log('NSIS assets generated successfully (24-bit)!');
}

generate();
