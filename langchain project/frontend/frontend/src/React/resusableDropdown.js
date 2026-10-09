import { useState } from "react";

function Dropdown({ options, placeholder = "Select.." }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState(false);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  function toggleOption(option) {
    setSelected((prev) =>
      prev.find((s) => s.value === option.value)
        ? prev.filter((s) => s.value !== option.value)
        : [...prev, option],
    );
  }
}
