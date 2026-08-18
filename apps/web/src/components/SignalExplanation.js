import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SignalExplanation({ signal }) {
    if (!signal) {
        return (_jsxs("div", { className: "panel", children: [_jsx("h2", { children: "Signal Reasoning" }), _jsx("p", { className: "muted", children: "Select a symbol to inspect strategy explanation." })] }));
    }
    return (_jsxs("div", { className: "panel", children: [_jsxs("h2", { children: [signal.symbol, " \u2014 ", signal.signal] }), _jsx("p", { className: "muted", children: "Every signal includes a transparent breakdown, never a black-box BUY/SELL call." }), _jsx("ul", { children: signal.explanation.map((line, index) => (_jsx("li", { children: line }, `${line}-${index}`))) }), _jsx("div", { className: "score-grid", children: Object.entries(signal.breakdown).map(([key, value]) => (_jsxs("div", { className: "score-card", children: [_jsx("strong", { children: key }), _jsx("span", { children: value.toFixed(1) })] }, key))) })] }));
}
