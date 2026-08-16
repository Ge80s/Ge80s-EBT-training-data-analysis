# AI 图表生成 JSON 解析问题修复总结

## 问题描述
用户在"AI分析中心"→"图表生成"功能中，当生成飞行员排名图表或其他图表时，收到错误：
> "AI 未返回有效 JSON，请修改描述后重试"

## 根本原因分析
在原始代码中（第 2646 行），使用了过于简陋的正则表达式来提取 JSON：
```python
match = re.search(r'\{.*\}', raw_spec, re.DOTALL)
if match:
    spec_data = json.loads(match.group(0))
```

这个方法存在以下问题：

1. **贪心匹配问题 (Greedy Matching)**
   - 正则表达式 `.*` 会贪心地从第一个 `{` 匹配到**最后一个** `}`
   - 当 AI 响应中有多个 JSON 对象时（例如在说明前先返回一个例子），会导致匹配范围过大
   - 结果是匹配到不完整或格式错误的 JSON 字符串

2. **嵌套 JSON 处理不当**
   - 对于包含嵌套对象的 JSON（如 `{"chart": {...}}` 这样的结构），正则表达式容易遗漏内层结构
   - 可能导致提取到中间某个 `}` 而不是完整的 JSON 对象

3. **缺乏容错机制**
   - 原代码的 try-except 块设计不完善，只能捕获 JSONDecodeError，但没有其他处理方式
   - 当 JSON 提取失败时，用户看不到详细的诊断信息

## 修复方案

### 1. 改进的 JSON 提取算法（第 2645-2681 行）
```python
spec_data = None
parse_error = None

# 尝试直接解析为 JSON（最简单的情况）
try:
    spec_data = json.loads(raw_spec)
except json.JSONDecodeError as e:
    # 如果直接解析失败，使用括号深度计算来精确定位 JSON 对象
    try:
        start_idx = raw_spec.find('{')
        if start_idx != -1:
            # 从第一个 { 开始，逐字符扫描
            # 遇到 { 时深度+1，遇到 } 时深度-1
            # 当深度为 0 时说明找到了完整的 JSON 对象
            depth = 0
            for i in range(start_idx, len(raw_spec)):
                if raw_spec[i] == '{':
                    depth += 1
                elif raw_spec[i] == '}':
                    depth -= 1
                    if depth == 0:
                        try:
                            spec_data = json.loads(raw_spec[start_idx:i+1])
                            break
                        except json.JSONDecodeError as inner_e:
                            parse_error = str(inner_e)
                            continue
        else:
            parse_error = "未找到 JSON 对象"
    except Exception as outer_e:
        parse_error = str(outer_e)
```

### 2. 改进的 AI Prompt（第 2621-2644 行）
新增以下要求：
- 明确要求只返回有效的 JSON，不要其他文字
- 禁止使用 markdown 代码块（```json```）
- 给出具体的 JSON 返回格式示例

### 3. 增强的错误诊断（第 2688-2695 行）
```python
if spec_data and isinstance(spec_data, dict) and 'chart' in spec_data:
    # 成功处理
else:
    st.error("❌ AI 返回的 JSON 格式无效或缺少必要字段。")
    with st.expander("👉 点击查看诊断信息"):
        st.write(f"**原始响应** (前500字):\n```\n{raw_spec[:500]}\n```")
        if parse_error:
            st.write(f"**解析错误**: {parse_error}")
        if spec_data:
            st.write(f"**已解析数据**: {spec_data}")
    st.caption("💡 请尝试换个描述方式...")
```

## 改进的优势

| 方面 | 原代码 | 改进后 |
|-----|------|--------|
| JSON 提取 | 正则表达式贪心匹配 | 括号深度精确定位 |
| 嵌套处理 | 容易遗漏 | 完全支持任意深度嵌套 |
| 容错能力 | 单一 try-catch | 多层级容错 + 详细错误信息 |
| 用户体验 | 简单错误提示 | 可展开诊断面板查看详细信息 |
| AI 指引 | 不够明确 | 更明确的格式要求 |

## 修复覆盖的场景

✅ AI 直接返回干净的 JSON
✅ AI 返回 JSON 前后附加文字或说明
✅ AI 返回格式化的嵌套 JSON 对象
✅ AI 使用 markdown 代码块包装 JSON
✅ JSON 中包含 null 值
✅ 多个嵌套对象的情况
✅ 提供详细的错误诊断信息

## 测试验证

创建了 `test_json_fix.py` 来验证修复逻辑，涵盖以下测试场景：
1. 干净的 JSON
2. JSON 前后有文字
3. 有 null 值的 JSON
4. markdown 代码块包装的 JSON
5. 多个嵌套对象
6. 贪心匹配边界情况

所有测试均通过，确保修复的有效性。

## 使用建议

用户在使用"图表生成"功能时，建议：
1. 描述清晰具体，例如："按机型对比各胜任力平均分" 而非模糊的"生成图表"
2. 如果遇到错误，点开"诊断信息"面板查看原始 AI 响应
3. 根据建议改变描述方式再次尝试

---

修复完成日期: 2026-05-20
修改的文件: app.py (lines 2620-2695)
