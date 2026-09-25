import struct, zlib, sys, os

def png(size, rgb, path):
    row = bytes([0]) + bytes(rgb) * size
    raw = row * size
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(data)

for s in (192, 512):
    png(s, (0x2F, 0x6F, 0x8F), f'public/icons/icon-{s}.png')
print('icons written')
