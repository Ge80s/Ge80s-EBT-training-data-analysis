import asyncio
import json
import os
import tempfile
import unittest

import ai_service


class TestGenerateAiStream(unittest.TestCase):
    def test_missing_api_key_returns_single_error_message(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = os.path.join(tmpdir, "ai_config.json")
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump({"provider": "gemini", "api_key": "", "model": "gemini-2.5-flash", "base_url": ""}, f)

            original_config_file = ai_service.CONFIG_FILE
            ai_service.CONFIG_FILE = config_path
            try:
                async def collect_chunks():
                    chunks = []
                    async for chunk in ai_service.generate_ai_stream("测试", context_data=""):
                        chunks.append(chunk)
                    return chunks

                chunks = asyncio.run(collect_chunks())
            finally:
                ai_service.CONFIG_FILE = original_config_file

            self.assertEqual(len(chunks), 1)
            self.assertIn("错误类型: Key 未配置", chunks[0])


if __name__ == "__main__":
    unittest.main()
