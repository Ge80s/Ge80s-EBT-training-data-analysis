import asyncio
import json
import os
import tempfile
import unittest

import pandas as pd

import ai_service
import business_logic


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

    def test_openai_compatible_base_url_adds_v1_path(self):
        self.assertEqual(
            ai_service.build_openai_compatible_chat_url("https://api.moonshot.cn"),
            "https://api.moonshot.cn/v1/chat/completions",
        )
        self.assertEqual(
            ai_service.build_openai_compatible_chat_url("https://api.moonshot.cn/v1"),
            "https://api.moonshot.cn/v1/chat/completions",
        )
        self.assertEqual(
            ai_service.build_openai_compatible_chat_url("https://api.moonshot.cn/v1/"),
            "https://api.moonshot.cn/v1/chat/completions",
        )

    def test_load_single_file_extracts_ob_columns_with_competency_prefix(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "2026_sample.xlsx")
            df = pd.DataFrame([
                ["姓名", "检查时间", "机型", "技术等级", "KNO", "PRO", "KNO OB.2", "PRO OB 1", "评语"],
                ["", "", "", "", "分数", "分数", "", "", ""],
                ["张三", "2026-03-01", "A320", "A2", 4.5, 4.2, "赞", "踩", "整体表现较好"],
            ])
            df.to_excel(path, index=False, header=False)

            result = business_logic.load_single_file(path)
            self.assertEqual(result["error"], None)
            self.assertGreater(len(result["pilots"]), 0)
            ob_labels = {item["label"] for item in result["pilots"][0]["ob_items"]}
            self.assertIn("KNO - OB2", ob_labels)
            self.assertIn("PRO - OB1", ob_labels)


if __name__ == "__main__":
    unittest.main()
