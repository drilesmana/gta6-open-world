"""Validate local hand-in output; requires Pillow for decoding screenshots."""
import base64
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'out')
assert {path.name for path in out.iterdir()} == {'game', 'screenshots', 'dossier.json'}
assert all(not path.name.startswith('.') and not path.is_symlink() for path in out.rglob('*'))
game = out / 'game'
paths = list(game.rglob('*'))
assert len(paths) <= 993
assert all(len(str(path.relative_to(out)).encode('utf-8')) <= 1000 for path in paths)
assert sum(path.stat().st_size for path in paths if path.is_file()) <= 48 * 1024**2
assert (game / 'index.html').stat().st_size <= 1024**2
for folder in ('game', 'screenshots'):
    source, exported = ROOT / folder, out / folder
    expected = {path.relative_to(source) for path in source.rglob('*')}
    assert expected == {path.relative_to(exported) for path in exported.rglob('*')}
    for path in expected:
        if (source / path).is_file():
            assert (source / path).read_bytes() == (exported / path).read_bytes(), path
shots = sorted((out / 'screenshots').iterdir())
assert 3 <= len(shots) <= 4
raw = (out / 'dossier.json').read_bytes()
dossier = json.loads(raw)
assert len(raw) <= 1536 * 1024 and len(dossier['text'].encode('utf-8')) <= 163_840
assert dossier['schema'] == 'makefun/dossier/v1' and dossier['cover'] == 0
assert [image['name'] for image in dossier['images']] == [shot.name for shot in shots]
for shot, record in zip(shots, dossier['images'], strict=True):
    with Image.open(shot) as image:
        assert image.format in ('PNG', 'JPEG') and max(image.size) <= 1280 and min(image.size) >= 480
        image.load()
        assert min(high - low for low, high in image.convert('RGB').getextrema()) > 50
        print(f'{shot.name}: {image.width}×{image.height}, {shot.stat().st_size:,} bytes')
    data = shot.read_bytes()
    assert len(data) <= 256 * 1024
    assert base64.b64decode(record['base64'], validate=True) == data
    assert hashlib.sha256(data).hexdigest() == record['sha256']
print(f'Package OK: {len(paths)} game paths; dossier {len(raw):,} bytes, text {len(dossier["text"].encode()):,} bytes.')
