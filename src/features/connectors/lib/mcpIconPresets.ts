import type { ImportConnectorMCPRequest } from "@/shared/data/api/dto/connectors";
import hub from "../assets/mcp-icons/hub.svg";
import database from "../assets/mcp-icons/database.svg";
import terminal from "../assets/mcp-icons/terminal.svg";
import code from "../assets/mcp-icons/code.svg";
import folder from "../assets/mcp-icons/folder.svg";
import search from "../assets/mcp-icons/search.svg";
import bolt from "../assets/mcp-icons/bolt.svg";
import build from "../assets/mcp-icons/build.svg";

export const MCP_ICON_ARTWORK: Record<NonNullable<ImportConnectorMCPRequest["iconPreset"]>, string> = { hub, database, terminal, code, folder, search, bolt, build };
