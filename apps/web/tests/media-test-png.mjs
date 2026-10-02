import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
// Test-only pixels; never production/Demo media. Valid PNG CRCs and scanlines
// let the Go decoder, actual browser and byte-exact download verify one file.
export function mediaPNG() {
 const crc=bytes=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0};
 const chunk=(type,data)=>{const name=Buffer.from(type),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([size,name,data,sum])};
 const w=160,h=100,header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc((1+w*3)*h);for(let y=0;y<h;y++){const row=y*(1+w*3);for(let x=0;x<w;x++){const at=row+1+x*3;pixels[at]=40+x;pixels[at+1]=25+y;pixels[at+2]=210-Math.floor(x/3)}}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(pixels)),chunk("IEND",Buffer.alloc(0))]);
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(mediaPNG());
