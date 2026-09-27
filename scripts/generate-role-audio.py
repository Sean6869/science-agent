"""Development-only: pip install edge-tts==7.2.8, then run this script.
Only generic text is sent for synthesis; student data is never used.
Deploy the resulting MP3 files. No Python/TTS service is needed at runtime.
"""
import asyncio
import json
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[1]

async def main():
    config = json.loads((ROOT / 'scripts/role-narration.json').read_text(encoding='utf-8'))
    output = ROOT / 'public/audio/roles'
    output.mkdir(parents=True, exist_ok=True)
    for name, text in config['clips'].items():
        target = output / f'{name}.mp3'
        temporary = target.with_suffix('.tmp')
        await edge_tts.Communicate(text, config['voice'], rate=config['rate']).save(str(temporary))
        if temporary.stat().st_size < 1000:
            raise RuntimeError(f'Empty audio: {name}')
        temporary.replace(target)
        print(f'Generated {name}: {target.stat().st_size} bytes', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
