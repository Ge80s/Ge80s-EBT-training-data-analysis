import os
import json
import httpx
from typing import Dict, Any, AsyncGenerator

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "ai_config.json")

DEFAULT_CONFIG = {
    "provider": "gemini",  # "gemini" | "kimi" | "custom"
    "api_key": "",
    "model": "gemini-2.5-flash",  # gemini: gemini-2.5-flash, gemini-1.5-pro | kimi: moonshot-v1-8k, moonshot-v1-32k
    "base_url": "",  # 可选自定义 API 端点
    "temperature": 0.7
}


def build_openai_compatible_chat_url(base_url: str, default_base: str = "https://api.moonshot.cn/v1") -> str:
    """规范化 OpenAI 兼容接口地址，避免出现 https://api.moonshot.cn/chat/completions 这类 404。"""
    candidate = (base_url or default_base).strip()
    if not candidate:
        candidate = default_base

    normalized = candidate.rstrip("/")
    if normalized.endswith("/chat/completions"):
        return normalized
    if normalized.endswith("/v1"):
        return f"{normalized}/chat/completions"
    if "/chat/completions" in normalized:
        return normalized
    return f"{normalized}/v1/chat/completions"


def load_ai_config() -> Dict[str, Any]:
    """读取 AI 接口配置，兼容旧格式与空文件。"""
    config = DEFAULT_CONFIG.copy()
    if not os.path.exists(CONFIG_FILE):
        return config

    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            for key, value in data.items():
                if value is not None:
                    config[key] = value
        return config
    except Exception:
        return config


def save_ai_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """保存 AI 接口配置，保留已有字段并覆盖新值。"""
    current = load_ai_config()
    cleaned = {}
    for key, value in (config or {}).items():
        if isinstance(value, str):
            cleaned[key] = value.strip()
        else:
            cleaned[key] = value
    current.update(cleaned)
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(current, f, ensure_ascii=False, indent=2)
    return current


async def test_ai_connection(config: Dict[str, Any] = None) -> Dict[str, Any]:
    """测试 AI 接口连通性"""
    cfg = load_ai_config()
    if isinstance(config, dict):
        cfg.update({k: v for k, v in config.items() if v is not None})
    provider = str(cfg.get("provider", "gemini") or "gemini").strip().lower()
    api_key = str(cfg.get("api_key", "") or "").strip()
    model = cfg.get("model", "gemini-2.5-flash").strip()
    custom_url = cfg.get("base_url", "").strip()

    if not api_key:
        return {"success": False, "message": "API Key 不能为空，请先在配置中输入 Key"}

    test_prompt = "Hello! Please reply 'EBT AI OK' to verify API connectivity."

    try:
        if provider == "gemini":
            base = custom_url if custom_url else "https://generativelanguage.googleapis.com/v1beta"
            url = f"{base.rstrip('/')}/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": test_prompt}]}]
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    res_json = resp.json()
                    candidates = res_json.get("candidates", [])
                    if candidates:
                        text = candidates[0]["content"]["parts"][0]["text"]
                        return {"success": True, "message": f"Google Gemini 连接成功！响应: {text[:60]}"}
                    return {"success": True, "message": "Google Gemini 响应正常！"}
                else:
                    return {"success": False, "message": f"Gemini API 错误 [{resp.status_code}]: {resp.text[:200]}"}

        elif provider in ["kimi", "moonshot", "custom"]:
            base = custom_url if custom_url else "https://api.moonshot.cn/v1"
            url = build_openai_compatible_chat_url(base, default_base="https://api.moonshot.cn/v1")
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            # Kimi/Moonshot models may restrict allowed temperature values.
            # Enforce a safe temperature according to configured value, but
            # override to 1 for Kimi-style providers when the model requires it.
            temp = cfg.get("temperature", DEFAULT_CONFIG.get("temperature", 0.7))
            if provider in ["kimi", "moonshot", "custom"]:
                temp = 1

            payload = {
                "model": model or "moonshot-v1-8k",
                "messages": [{"role": "user", "content": test_prompt}],
                "temperature": temp
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    res_json = resp.json()
                    choices = res_json.get("choices", [])
                    if choices:
                        text = choices[0]["message"]["content"]
                        return {"success": True, "message": f"Kimi/Moonshot 连接成功！响应: {text[:60]}"}
                    return {"success": True, "message": "Kimi API 响应正常！"}
                else:
                    return {"success": False, "message": f"Kimi API 错误 [{resp.status_code}]: {resp.text[:200]}"}

        else:
            return {"success": False, "message": f"未知的 AI 提供商: {provider}"}

    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


async def generate_ai_stream(prompt: str, context_data: str = "") -> AsyncGenerator[str, None]:
    """生成流式 AI 响应 (SSE Generator)"""
    cfg = load_ai_config()
    provider = str(cfg.get("provider", "gemini") or "gemini").strip().lower()
    api_key = str(cfg.get("api_key", "") or "").strip()
    model = str(cfg.get("model", "gemini-2.5-flash") or "gemini-2.5-flash").strip()
    custom_url = str(cfg.get("base_url", "") or "").strip()

    system_prompt = (
        "你是一名民用航空 Evidence-Based Training (EBT) 飞行训练与安全分析专家。\n"
        "请基于提供的 EBT 评估数据及背景信息，回答用户的提问。输出格式清晰、专业、逻辑严密，多用 Markdown 结构化表达。"
    )

    full_user_content = f"{system_prompt}\n\n[上下文数据背景]\n{context_data}\n\n[用户问题]\n{prompt}"

    if not api_key:
        fallback_msg = (
            "⚠️ [错误类型: Key 未配置]\n\n"
            "当前后端没有读取到有效的 AI API Key。\n"
            "请前往 **智能评语模块 -> AI 接口配置** 页面，重新保存并测试您的 **Google Gemini** 或 **Kimi (Moonshot)** API Key。\n\n"
            "**预览回答 (规则推理)**：基于当前评估上下文，建议关注人员低分指标，加强 SOP 执行力与自动化依赖管理。"
        )
        yield fallback_msg
        return

    try:
        if provider == "gemini":
            base = custom_url if custom_url else "https://generativelanguage.googleapis.com/v1beta"
            url = f"{base.rstrip('/')}/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": full_user_content}]}]
            }
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        err_detail = err_text.decode('utf-8', errors='ignore')[:400]
                        yield (
                            f"⚠️ [错误类型: 接口返回错误]\n\n"
                            f"Google Gemini 请求失败，HTTP 状态码: {response.status_code}\n"
                            f"返回内容: {err_detail}\n\n"
                            f"请检查 API Key、模型名称或服务端地址是否正确。"
                        )
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            try:
                                data = json.loads(line[6:])
                                candidates = data.get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    for p in parts:
                                        if "text" in p:
                                            yield p["text"]
                                else:
                                    yield "⚠️ [错误类型: 接口响应格式异常]\n\n服务端没有返回可解析的候选内容。"
                            except Exception as exc:
                                yield f"⚠️ [错误类型: 接口响应格式异常]\n\n解析流式响应失败: {exc}"

        elif provider in ["kimi", "moonshot", "custom"]:
            base = custom_url if custom_url else "https://api.moonshot.cn/v1"
            url = build_openai_compatible_chat_url(base, default_base="https://api.moonshot.cn/v1")
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            # Respect configured temperature, but enforce 1 for Kimi/Moonshot
            cfg_temp = cfg.get("temperature", DEFAULT_CONFIG.get("temperature", 0.7))
            if provider in ["kimi", "moonshot", "custom"]:
                cfg_temp = 1

            payload = {
                "model": model or "moonshot-v1-8k",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"[上下文数据背景]\n{context_data}\n\n[用户问题]\n{prompt}"}
                ],
                "stream": True,
                "temperature": cfg_temp
            }
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        err_detail = err_text.decode('utf-8', errors='ignore')[:400]
                        yield (
                            f"⚠️ [错误类型: 接口返回错误]\n\n"
                            f"Kimi/Moonshot 请求失败，HTTP 状态码: {response.status_code}\n"
                            f"返回内容: {err_detail}\n\n"
                            f"请检查 API Key、模型名称或服务端地址是否正确。"
                        )
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                data = json.loads(line[6:])
                                choices = data.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    if "content" in delta:
                                        yield delta["content"]
                                else:
                                    yield "⚠️ [错误类型: 接口响应格式异常]\n\n服务端没有返回可解析的流式内容。"
                            except Exception as exc:
                                yield f"⚠️ [错误类型: 接口响应格式异常]\n\n解析流式响应失败: {exc}"

    except httpx.TimeoutException:
        yield "⚠️ [错误类型: 超时]\n\nAI 服务响应超时，请检查网络连接或接口服务状态。"
    except httpx.RequestError as e:
        yield f"⚠️ [错误类型: 网络请求失败]\n\n{str(e)}"
    except Exception as e:
        yield f"⚠️ [错误类型: 未知异常]\n\n{str(e)}"
