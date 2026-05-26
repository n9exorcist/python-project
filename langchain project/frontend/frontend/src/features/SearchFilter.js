import { useMemo, useState } from "react";
const FRUITS = ["Apple", "Banana", "Apricot", "Mango", "Grapes"];
export default function SearchFilter() {
  const [searchTerm, setSearchTerm] = useState("");
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    console.log("qello", q);
    if (!q) return FRUITS;
    return FRUITS.filter((fruit) => fruit.toLowerCase().includes(q));
  }, [searchTerm]);

  return (
    <>
      <input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <ul>
        {filtered.map((fruit) => (
          <li key={fruit}>{fruit}</li>
        ))}
      </ul>
    </>
  );
}
