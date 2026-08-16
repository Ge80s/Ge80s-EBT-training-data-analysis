import asyncio
import sys
sys.path.append('.')
from ai_service import generate_ai_stream

async def main():
    async for chunk in generate_ai_stream('测试', context_data=''):
        print(chunk)

asyncio.run(main())
