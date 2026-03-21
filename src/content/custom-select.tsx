import React, { useEffect, useRef, useState } from "react";

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; title?: string }[];
  placeholder?: string;
  disabled?: boolean;
  maxLabelLength?: number;
}

function truncateText(text: string, maxLength: number): string {
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  maxLabelLength = 40
}: CustomSelectProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((option) => option.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder ?? "";

  const filteredOptions = search.trim()
    ? options.filter((option) =>
      option.label.toLowerCase().includes(search.trim().toLowerCase())
    )
    : options;

  return (
    <div className="spx-custom-select" ref={ref}>
      <input
        type="text"
        className="spx-input-clean"
        disabled={disabled}
        readOnly={!isOpen}
        value={isOpen ? search : truncateText(displayLabel, maxLabelLength)}
        onChange={(event) => setSearch(event.target.value)}
        onClick={() => {
          if (disabled || isOpen) {
            return;
          }
          setIsOpen(true);
          setSearch("");
        }}
        placeholder={isOpen ? truncateText(displayLabel, maxLabelLength) : placeholder}
        title={selectedOption?.title || selectedOption?.label || placeholder}
      />

      {isOpen ? (
        <div className="spx-select-dropdown">
          {filteredOptions.length === 0 ? (
            <div
              className="spx-select-option"
              style={{ opacity: 0.5, cursor: "default", fontStyle: "italic" }}
            >
              No results found
            </div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                className={`spx-select-option ${option.value === value ? "spx-selected" : ""}`}
                title={option.title || option.label}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setSearch("");
                }}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
