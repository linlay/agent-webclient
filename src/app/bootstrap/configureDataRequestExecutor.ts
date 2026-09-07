import { configureDataRequestExecutor } from "@/shared/data/api/dataRequestExecutor";
import { requestPlatformData } from "@/features/transport/lib/platformDataRequestTransport";

export function configureApplicationDataRequestExecutor(): void {
  configureDataRequestExecutor(requestPlatformData);
}
