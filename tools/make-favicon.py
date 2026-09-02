import zlib, struct, io

# 16x16 pixel portrait of an office dweller: headphones, warm lamp light, a "!" bubble
P = {
    '.': None,            # transparent
    'b': '2a1d15',        # warm dark backdrop
    'h': '6b3f2a',        # hair
    's': 'f4c9a0',        # skin
    'e': '2b2118',        # eyes
    'p': '3a3a46',        # headphones
    'c': '4fa89a',        # shirt
    'w': 'ffd166',        # the "!" that means "I'm waiting for you"
    'g': '9fe0a8',        # screen glow
}

ART = [
    'bbbbbbbbbbbbbbbb',
    'bbbbbppppppbbbbb',
    'bbbbphhhhhhpbbwb',
    'bbbpphhhhhhppbwb',
    'bbbppshhhhsppbwb',
    'bbbppssssssppbbb',
    'bbbppsessesppbwb',
    'bbbppssssssppbbb',
    'bbbbpsseesspbbbb',
    'bbbbbssssssbbbbb',
    'bbbbbbssssbbbbbb',
    'bbbbbbbssbbbbbbb',
    'bbbbccccccccbbbb',
    'bbbcccggggcccbbb',
    'bbcccccccccccc bb'.replace(' ',''),
    'bbccccccccccccbb',
]

W = len(ART[0])
assert all(len(r) == W for r in ART) and len(ART) == 16

def rgba(ch):
    hexv = P[ch]
    if hexv is None:
        return (0, 0, 0, 0)
    return (int(hexv[0:2], 16), int(hexv[2:4], 16), int(hexv[4:6], 16), 255)

def png(path, scale):
    size = 16 * scale
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(rgba(ART[y // scale][x // scale]))
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) \
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(out)
    return len(out)

def svg(path):
    rects = []
    for y, row in enumerate(ART):
        x = 0
        while x < W:
            ch = row[x]
            run = 1
            while x + run < W and row[x + run] == ch:
                run += 1
            if P[ch] is not None:
                rects.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="#{P[ch]}"/>')
            x += run
    body = ''.join(rects)
    open(path, 'w').write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" '
        f'shape-rendering="crispEdges">{body}</svg>')

print('png32:', png('web/favicon.png', 2), 'байт')
print('png128:', png('web/favicon-128.png', 8), 'байт')
svg('web/favicon.svg')
print('svg:', len(open('web/favicon.svg').read()), 'байт')
