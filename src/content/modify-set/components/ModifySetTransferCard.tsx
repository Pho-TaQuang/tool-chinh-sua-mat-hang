import React, { useRef } from "react";
import { Download, Upload } from "../../ui/icons";
import type { ModifySetExportFormat } from "../export";
import type { ModifySetImportFormat } from "../import";

interface ModifySetTransferCardProps {
  isBusy: boolean;
  canExport: boolean;
  onExport: (format: ModifySetExportFormat) => void;
  onImport: (format: ModifySetImportFormat, file: File) => void;
}

export function ModifySetTransferCard({
  isBusy,
  canExport,
  onExport,
  onImport
}: ModifySetTransferCardProps): React.JSX.Element {
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const exportDisabled = isBusy || !canExport;

  const handleImportChange =
    (format: ModifySetImportFormat) =>
      (event: React.ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
          return;
        }

        onImport(format, file);
      };

  return (
    <div className="spx-card spx-modset-transfer-card">
      <div className="spx-modset-transfer-main">
        <div className="spx-modset-transfer-title">Modify set files</div>
      </div>
      <div className="spx-modset-transfer-actions">
        <button className="spx-big-btn spx-warning" onClick={() => onExport("csv")} disabled={exportDisabled}>
          <Download /> Export CSV
        </button>
        <button className="spx-big-btn spx-warning" onClick={() => onExport("json")} disabled={exportDisabled}>
          <Download /> Export JSON
        </button>
        <button className="spx-big-btn spx-green" onClick={() => csvInputRef.current?.click()} disabled={isBusy}>
          <Upload /> Import CSV
        </button>
        <button className="spx-big-btn spx-green" onClick={() => jsonInputRef.current?.click()} disabled={isBusy}>
          <Upload /> Import JSON
        </button>
      </div>
      <input
        ref={csvInputRef}
        className="spx-modset-file-input"
        type="file"
        accept=".csv,text/csv"
        onChange={handleImportChange("csv")}
      />
      <input
        ref={jsonInputRef}
        className="spx-modset-file-input"
        type="file"
        accept=".json,application/json"
        onChange={handleImportChange("json")}
      />
    </div>
  );
}
