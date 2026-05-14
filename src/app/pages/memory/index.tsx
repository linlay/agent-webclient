import { MemoryInfoModal } from "@/features/settings/components/MemoryInfoModal";
import { useAppDispatch } from "@/app/state/AppContext";
import { useEffect } from "react";

export const MemoryPage = () => {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: "SET_MEMORY_INFO_OPEN", open: true });
  }, [dispatch]);

  return <MemoryInfoModal />;
};
