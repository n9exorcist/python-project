import React from "react";
import { FixedSizeList as List } from "react-window"; // ← use named export in v1

const LogRow = ({ index, style }) => {
  const bgClass = index % 2 === 0 ? "bg-gray-50" : "bg-white";
  return (
    <div
      style={style}
      className={`flex items-center px-4 border-b border-gray-100 text-xs font-mono text-black ${bgClass}`}
    >
      <span className="text-gray-400 mr-2">[{index + 1}]</span>
      <span className="text-blue-600 font-semibold mr-2">[INFO]</span>
      <span className="text-gray-700">
        AI Stream Chunk received successfully. Status: 200 OK
      </span>
    </div>
  );
};

const VirtualizedLogs = () => {
  return (
    <div className="mt-6 border rounded-lg shadow-sm bg-white">
      <div className="bg-gray-800 text-gray-200 px-4 py-2 text-xs font-bold font-mono flex justify-between items-center">
        <span>🤖 LANGCHAIN PROCESS LOGS (Virtualized)</span>
        <span className="bg-green-500 text-gray-900 px-1.5 py-0.5 rounded text-[10px] animate-pulse">
          10,000 ITEMS
        </span>
      </div>

      <List
        height={300}
        itemCount={10000}
        itemSize={35}
        width={window.innerWidth}
      >
        {({ index, style }) => <LogRow index={index} style={style} />}
      </List>
    </div>
  );
};

VirtualizedLogs.displayName = "VirtualizedLogs";
export default VirtualizedLogs;
