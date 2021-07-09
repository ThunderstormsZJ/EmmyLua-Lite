# 在luaide-lite基础上得改版
* 添加EmmyLua得调试功能，去除原有得JIT调试

   
# Fulllist | 完整列表
* 标准格式化: [稳定] 与 IntelliJ IDEA 平台的 EmmyLua 格式化结果一致, 参考VS的格式化标准, 设置'enableFormat'以启用或禁用格式化, 你可以选择其他的格式化库, 例如vscode-lua.
* 远程调试: [稳定][继承] 使用Socket传送断点数据, 调试示例在群文件或Github中下载, 包含cocos, lua51, tolua, slua, xlua 等, 环境配置请参考各示例的README.md文件.
* 代码检查: [稳定][继承] 标准的代码检查.
* 智能代码提示: [稳定][继承] 代码片段, 代码完成提示, 全局提示, 定义跳转.
* 注解: [稳定][继承] 引用自 EmmyLua and LDoc.
* 全局高亮: [稳定][继承] 将全局变量高亮显示, 代码编辑时对全局变量更敏感, 设置中的'enableHighlight'等可以选择是否启用高亮以及设置高亮颜色.
* 批量格式化: [稳定] 选中文件/文件夹, 点击'Lua/Format File(s)'以格式化这些文件.
* 查找所有引用: [稳定][继承] 选中代码片段 Alt + F2 或 右键 Fild All References.
* 代码重构: [稳定][继承] 选中代码片段Ctrl + R + R 重命名所有文件中相关的标识符.
* 模板文件: [稳定] 你可以在设置中添加 'templateDir' 和 'templateDefine' 以指定模板文件目录以及全局文本替换字段, 在工程结构目录右键选择 'Lua/New Template' 以创建模板文件.
* 单文件调试: [稳定] 支持使用Lua51调试demo.
* 条件断点: [稳定] 支持设置表达式以及断点次数.

