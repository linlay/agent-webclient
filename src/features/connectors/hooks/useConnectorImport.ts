import { useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { connectorImportErrorKey, isConnectorImportConflict, validateConnectorArchive } from "@/features/connectors/lib/connectorImport";

interface Options {
  onImport: (file: File, overwrite: boolean) => Promise<string | null>;
  onImported: () => void;
}

export function useConnectorImport({ onImport, onImported }: Options) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [archive, setArchive] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [overwriteRequired, setOverwriteRequired] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submittingRef = useRef(false);

  const acceptFiles = (files: File[]) => {
    if (submittingRef.current || files.length === 0) return;
    const validation = files.length > 1 ? "multiple" : validateConnectorArchive(files[0]);
    setOverwriteRequired(false);
    setError(validation ? t(`connectors.import.error.${validation}`) : "");
    setArchive(validation ? null : files[0]);
  };

  const submit = async () => {
    if (!archive || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const id = await onImport(archive, overwriteRequired);
      if (!id) return;
      setMessage(t("connectors.import.success", { id }));
      setOpen(false);
      setArchive(null);
      setOverwriteRequired(false);
      onImported();
    } catch (cause) {
      const conflict = isConnectorImportConflict(cause);
      setOverwriteRequired(conflict);
      const errorKey = connectorImportErrorKey(cause);
      if (!conflict) setError(errorKey ? t(errorKey) : cause instanceof Error ? cause.message : String(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return {
    open, archive, submitting, overwriteRequired, error, message, acceptFiles, submit,
    show: () => {
      if (submittingRef.current) return;
      setArchive(null);
      setError("");
      setMessage("");
      setOverwriteRequired(false);
      setOpen(true);
    },
    close: () => { if (!submittingRef.current) setOpen(false); },
  };
}
