import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function signalColor(signal) {
    switch (signal) {
        case "LONG":
            return "#22c55e";
        case "SHORT":
            return "#ef4444";
        case "WATCH":
            return "#f59e0b";
        default:
            return "#9ca3af";
    }
}
export function ScannerTable({ rows, selectedSymbol, onSelectSymbol }) {
    return (_jsxs("div", { className: "panel", children: [_jsx("h2", { children: "Market Scanner" }), _jsx("p", { className: "muted", children: "Ranked symbols with transparent scoring. Click any symbol to inspect trendlines and decision logic." }), _jsx("div", { className: "table-wrap", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Symbol" }), _jsx("th", { children: "Price" }), _jsx("th", { children: "Trend" }), _jsx("th", { children: "Action" }), _jsx("th", { children: "Safety" }), _jsx("th", { children: "Score" }), _jsx("th", { children: "Signal" }), _jsx("th", { children: "Confidence" }), _jsx("th", { children: "Risk/Share" })] }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs("tr", { className: selectedSymbol === row.symbol ? "selected" : "", onClick: () => onSelectSymbol(row.symbol), children: [_jsx("td", { children: row.symbol }), _jsx("td", { children: row.lastPrice.toFixed(2) }), _jsx("td", { children: row.trendDirection }), _jsx("td", { children: row.actionLine?.toFixed(2) ?? "-" }), _jsx("td", { children: row.safetyLine?.toFixed(2) ?? "-" }), _jsx("td", { children: row.score.toFixed(1) }), _jsx("td", { style: { color: signalColor(row.signal), fontWeight: 700 }, children: row.signal }), _jsx("td", { children: row.confidence.toFixed(1) }), _jsx("td", { children: row.riskPerShare?.toFixed(2) ?? "-" })] }, row.symbol))) })] }) })] }));
}
