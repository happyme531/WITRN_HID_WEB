# WITRN HID Web

一个基于 **React + Vite + TypeScript + Pyodide** 的 WITRN USB PD 浏览器端上位机，可直接在网页上完成报文解码与可视化。当前版本具备：

> 本项目由 GPT-5 AI 编写，仍存在不少 bug 与性能问题，欢迎提交 PR 改进体验。感谢 [JohnScotttt/WITRN_HID_API](https://github.com/JohnScotttt/WITRN_HID_API) 依赖库作者的支持。

- 自动加载 Pyodide，并在浏览器内运行官方 `witrnhid` 解析模块；
- 通过 WebHID（Chrome / Edge 等 Chromium 浏览器支持）直连 WITRN 设备，实时解析 General/PD 报文；
- 常规电压、电流、功率等指标面板，附带 PD 报文历史列表与详细解码结果；
- 可选自动跟随、手动查看、报文清空等交互，以及长度、顺序的完整性校验。

## 本地运行

```bash
npm install
npm run dev
```

运行后访问终端里提示的本地地址即可。Pyodide 会在页面加载时从 CDN 拉取（约 8MB），首次进入需要稍等片刻。

## 构建静态文件

```bash
npm run build
```

构建产物位于 `dist/`，直接部署到 GitHub Pages 或任何静态托管即可。若部署环境无法访问外网，请将 `public/python` 与 Pyodide 资源同步到站点并调整 `src/hooks/usePyodide.ts` 的 `PYODIDE_INDEX_URL`。

## WebHID 使用提示

1. 仅 Chromium 系浏览器（Chrome / Edge 96+ 等）支持 WebHID；首次连接需按提示授权。
2. 点击“选择设备”后挑选 VID `0x0716` / PID `0x5060` 的 WITRN 设备，授权成功会自动打开 HID report 监听。
3. 设备每收到 HID 报文即推送至浏览器端队列，PD 报文会被完整解码并存入历史列表。
4. 若浏览器或系统未开放 HID 权限，请在系统设置中授予访问权限，或换用已支持 WebHID 的环境。

## 下一步思路

- 引入图表/趋势视图，补充功率、电压、电流随时间曲线；
- 为 PD 历史提供过滤、导出与收藏能力；
- 针对离线模式提供报文导入/导出与批量解析工具。
