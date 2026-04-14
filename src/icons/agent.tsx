import React, { useCallback } from "react";
import { Avatar, AvatarProps } from "antd/es";
import { TeamOutlined, UserOutlined } from "@ant-design/icons";

const Ledger: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA"></stop>
          <stop offset="100%" stopColor="#2563EB"></stop>
        </linearGradient>
        <linearGradient id="g1b" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#93C5FD"></stop>
          <stop offset="100%" stopColor="#3B82F6"></stop>
        </linearGradient>
      </defs>

      <path
        d="M24 6L40 14L24 22L8 14L24 6Z"
        fill="url(#g1)"
        opacity="0.9"
      ></path>
      <path
        d="M8 22L24 30L40 22L24 14L8 22Z"
        fill="url(#g1b)"
        opacity="0.6"
      ></path>
      <path
        d="M8 30L24 38L40 30L24 22L8 30Z"
        fill="url(#g1)"
        opacity="0.3"
      ></path>
    </svg>
  );
};
const Equity: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D"></stop>
          <stop offset="100%" stopColor="#D97706"></stop>
        </linearGradient>
      </defs>

      <path
        d="M24 4L42 18L24 44L6 18L24 4Z"
        fill="url(#g2)"
        opacity="0.8"
      ></path>
      <path
        d="M24 4L32 18L24 44L16 18L24 4Z"
        fill="#FFFFFF"
        opacity="0.3"
      ></path>
    </svg>
  );
};
const Vault: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399"></stop>
          <stop offset="100%" stopColor="#059669"></stop>
        </linearGradient>
      </defs>

      <path
        d="M24 4L40 10V22C40 32 24 44 24 44C24 44 8 32 8 22V10L24 4Z"
        fill="url(#g3)"
        opacity="0.4"
      ></path>
      <path
        d="M24 12L34 16V24C34 31 24 38 24 38C24 38 14 31 14 24V16L24 12Z"
        fill="url(#g3)"
        opacity="0.9"
      ></path>
    </svg>
  );
};
const Pulse: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g4" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A78BFA"></stop>
          <stop offset="100%" stopColor="#6D28D9"></stop>
        </linearGradient>
      </defs>

      <path
        d="M4 24C12 24 16 12 24 12C32 12 36 24 44 24"
        stroke="url(#g4)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.4"
      ></path>
      <path
        d="M4 32C12 32 16 20 24 20C32 20 36 32 44 32"
        stroke="url(#g4)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.9"
      ></path>
    </svg>
  );
};
const Nexus: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g5" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22D3EE"></stop>
          <stop offset="100%" stopColor="#0891B2"></stop>
        </linearGradient>
      </defs>

      <circle
        cx="24"
        cy="24"
        r="16"
        stroke="url(#g5)"
        strokeWidth="4"
        opacity="0.3"
      ></circle>
      <path
        d="M24 8C32.8366 8 40 15.1634 40 24"
        stroke="url(#g5)"
        strokeWidth="6"
        strokeLinecap="round"
      ></path>
      <path
        d="M8 24C8 15.1634 15.1634 8 24 8"
        stroke="url(#g5)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.6"
      ></path>
      <circle cx="24" cy="24" r="6" fill="url(#g5)"></circle>
    </svg>
  );
};

const Quantum: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g6" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F472B6"></stop>
          <stop offset="100%" stopColor="#DB2777"></stop>
        </linearGradient>
      </defs>

      <path
        d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
        stroke="url(#g6)"
        strokeWidth="4"
        opacity="0.3"
      ></path>
      <path
        d="M24 12L36 19V29L24 36L12 29V19L24 12Z"
        fill="url(#g6)"
        opacity="0.8"
      ></path>
      <circle cx="24" cy="24" r="4" fill="#FFFFFF"></circle>
    </svg>
  );
};
const Yield: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g7" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2DD4BF"></stop>
          <stop offset="100%" stopColor="#0D9488"></stop>
        </linearGradient>
      </defs>

      <rect
        x="6"
        y="28"
        width="10"
        height="14"
        rx="2"
        fill="url(#g7)"
        opacity="0.3"
      ></rect>
      <rect
        x="19"
        y="18"
        width="10"
        height="24"
        rx="2"
        fill="url(#g7)"
        opacity="0.6"
      ></rect>
      <rect
        x="32"
        y="6"
        width="10"
        height="36"
        rx="2"
        fill="url(#g7)"
        opacity="0.9"
      ></rect>
    </svg>
  );
};
const Oracle: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g8" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8"></stop>
          <stop offset="100%" stopColor="#4338CA"></stop>
        </linearGradient>
      </defs>

      <path
        d="M24 10C12 10 4 24 4 24C4 24 12 38 24 38C36 38 44 24 44 24C44 24 36 10 24 10Z"
        fill="url(#g8)"
        opacity="0.2"
      ></path>
      <circle cx="24" cy="24" r="10" fill="url(#g8)" opacity="0.6"></circle>
      <circle cx="24" cy="24" r="5" fill="url(#g8)"></circle>
    </svg>
  );
};
const Vertex: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g9" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FB7185"></stop>
          <stop offset="100%" stopColor="#E11D48"></stop>
        </linearGradient>
      </defs>

      <path d="M24 4L44 40H4L24 4Z" fill="url(#g9)" opacity="0.3"></path>
      <path d="M24 16L36 40H12L24 16Z" fill="url(#g9)" opacity="0.6"></path>
      <path d="M24 28L28 40H20L24 28Z" fill="url(#g9)" opacity="0.9"></path>
    </svg>
  );
};
const Matrix: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g10" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E879F9"></stop>
          <stop offset="100%" stopColor="#C026D3"></stop>
        </linearGradient>
      </defs>

      <rect
        x="6"
        y="6"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="0.2"
      ></rect>
      <rect
        x="19"
        y="6"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="0.4"
      ></rect>
      <rect
        x="32"
        y="6"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="0.6"
      ></rect>
      <rect
        x="6"
        y="19"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="0.4"
      ></rect>
      <rect
        x="19"
        y="19"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="0.6"
      ></rect>
      <rect
        x="32"
        y="19"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="0.8"
      ></rect>
      <rect
        x="6"
        y="32"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="0.6"
      ></rect>
      <rect
        x="19"
        y="32"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="0.8"
      ></rect>
      <rect
        x="32"
        y="32"
        width="10"
        height="10"
        rx="2"
        fill="url(#g10)"
        opacity="1.0"
      ></rect>
    </svg>
  );
};
const Flux: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g11" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8"></stop>
          <stop offset="100%" stopColor="#0284C7"></stop>
        </linearGradient>
      </defs>

      <path
        d="M8 24C8 15 16 15 24 24C32 33 40 33 40 24C40 15 32 15 24 24C16 33 8 33 8 24Z"
        fill="url(#g11)"
        opacity="0.4"
      ></path>
      <path
        d="M12 24C12 18 18 18 24 24C30 30 36 30 36 24C36 18 30 18 24 24C18 30 12 30 12 24Z"
        stroke="url(#g11)"
        strokeWidth="4"
        fill="none"
        opacity="0.9"
      ></path>
    </svg>
  );
};
const Apex: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g12" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#FB923C"></stop>
          <stop offset="100%" stopColor="#EA580C"></stop>
        </linearGradient>
      </defs>

      <path
        d="M24 4L44 20L38 26L24 14L10 26L4 20L24 4Z"
        fill="url(#g12)"
        opacity="0.9"
      ></path>
      <path
        d="M24 16L44 32L38 38L24 26L10 38L4 32L24 16Z"
        fill="url(#g12)"
        opacity="0.5"
      ></path>
      <path
        d="M24 28L44 44L38 48L24 38L10 48L4 44L24 28Z"
        fill="url(#g12)"
        opacity="0.2"
      ></path>
    </svg>
  );
};
const Cipher: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g13" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#94A3B8"></stop>
          <stop offset="100%" stopColor="#475569"></stop>
        </linearGradient>
      </defs>

      <rect
        x="8"
        y="8"
        width="32"
        height="32"
        transform="rotate(45 24 24)"
        stroke="url(#g13)"
        strokeWidth="4"
        fill="none"
        opacity="0.3"
      ></rect>
      <rect
        x="14"
        y="14"
        width="20"
        height="20"
        transform="rotate(45 24 24)"
        stroke="url(#g13)"
        strokeWidth="4"
        fill="none"
        opacity="0.6"
      ></rect>
      <rect
        x="20"
        y="20"
        width="8"
        height="8"
        transform="rotate(45 24 24)"
        fill="url(#g13)"
        opacity="0.9"
      ></rect>
    </svg>
  );
};
const Prism: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g14" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C084FC"></stop>
          <stop offset="100%" stopColor="#7E22CE"></stop>
        </linearGradient>
      </defs>

      <path
        d="M24 4L44 38H4L24 4Z"
        stroke="url(#g14)"
        strokeWidth="3"
        fill="none"
        opacity="0.4"
      ></path>
      <path
        d="M4 16L24 28L44 16"
        stroke="url(#g14)"
        strokeWidth="3"
        fill="none"
        opacity="0.6"
      ></path>
      <path
        d="M24 28V44"
        stroke="url(#g14)"
        strokeWidth="3"
        fill="none"
        opacity="0.6"
      ></path>
      <polygon
        points="24,12 32,24 24,36 16,24"
        fill="url(#g14)"
        opacity="0.8"
      ></polygon>
    </svg>
  );
};
const Horizon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g15" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A3E635"></stop>
          <stop offset="100%" stopColor="#4D7C0F"></stop>
        </linearGradient>
      </defs>

      <path
        d="M4 36H44"
        stroke="url(#g15)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.9"
      ></path>
      <path
        d="M8 36 A 16 16 0 0 1 40 36"
        stroke="url(#g15)"
        strokeWidth="4"
        fill="none"
        opacity="0.6"
      ></path>
      <path
        d="M16 36 A 8 8 0 0 1 32 36"
        stroke="url(#g15)"
        strokeWidth="4"
        fill="none"
        opacity="0.3"
      ></path>
    </svg>
  );
};
const Aura: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g16" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047"></stop>
          <stop offset="100%" stopColor="#A16207"></stop>
        </linearGradient>
      </defs>

      <circle
        cx="24"
        cy="24"
        r="20"
        stroke="url(#g16)"
        strokeWidth="2"
        stroke-dasharray="4 4"
        fill="none"
        opacity="0.4"
      ></circle>
      <circle
        cx="24"
        cy="24"
        r="14"
        stroke="url(#g16)"
        strokeWidth="3"
        fill="none"
        opacity="0.6"
      ></circle>
      <circle cx="24" cy="24" r="8" fill="url(#g16)" opacity="0.9"></circle>
    </svg>
  );
};
const Node: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g17" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8"></stop>
          <stop offset="100%" stopColor="#3730A3"></stop>
        </linearGradient>
      </defs>

      <polygon
        points="24,4 42,14 42,34 24,44 6,34 6,14"
        stroke="url(#g17)"
        strokeWidth="3"
        fill="none"
        opacity="0.4"
      ></polygon>
      <line
        x1="6"
        y1="14"
        x2="42"
        y2="34"
        stroke="url(#g17)"
        strokeWidth="2"
        opacity="0.5"
      ></line>
      <line
        x1="6"
        y1="34"
        x2="42"
        y2="14"
        stroke="url(#g17)"
        strokeWidth="2"
        opacity="0.5"
      ></line>
      <line
        x1="24"
        y1="4"
        x2="24"
        y2="44"
        stroke="url(#g17)"
        strokeWidth="2"
        opacity="0.5"
      ></line>
      <circle cx="24" cy="24" r="6" fill="url(#g17)" opacity="0.9"></circle>
    </svg>
  );
};
const Echo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g18" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2DD4BF"></stop>
          <stop offset="100%" stopColor="#0F766E"></stop>
        </linearGradient>
      </defs>

      <rect
        x="4"
        y="4"
        width="24"
        height="24"
        rx="4"
        stroke="url(#g18)"
        strokeWidth="3"
        fill="none"
        opacity="0.2"
      ></rect>
      <rect
        x="12"
        y="12"
        width="24"
        height="24"
        rx="4"
        stroke="url(#g18)"
        strokeWidth="3"
        fill="none"
        opacity="0.5"
      ></rect>
      <rect
        x="20"
        y="20"
        width="24"
        height="24"
        rx="4"
        fill="url(#g18)"
        opacity="0.8"
      ></rect>
    </svg>
  );
};
const Nova: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g19" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F87171"></stop>
          <stop offset="100%" stopColor="#B91C1C"></stop>
        </linearGradient>
      </defs>

      <path
        d="M24 2L28 20L46 24L28 28L24 46L20 28L2 24L20 20Z"
        fill="url(#g19)"
        opacity="0.4"
      ></path>
      <path
        d="M24 10L26 22L38 24L26 26L24 38L22 26L10 24L22 22Z"
        fill="url(#g19)"
        opacity="0.9"
      ></path>
    </svg>
  );
};
const Zenith: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g20" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047"></stop>
          <stop offset="100%" stopColor="#CA8A04"></stop>
        </linearGradient>
      </defs>

      <path d="M24 4L36 20L24 36L12 20Z" fill="url(#g20)" opacity="0.9"></path>
      <path d="M24 4L36 20L24 36Z" fill="#FFFFFF" opacity="0.3"></path>
      <path
        d="M8 42 Q 24 34 40 42"
        stroke="url(#g20)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      ></path>
    </svg>
  );
};

interface AgentIconProps {
  icon?: {
    color?: string;
    name?: string;
  };
  type: "agent" | "team";
  props?: {
    icon?: React.SVGProps<SVGSVGElement>;
    avatar?: AvatarProps;
  };
}
export const AgentIcon: React.FC<AgentIconProps> = ({ icon, type, props }) => {
  const render = useCallback(() => {
    const name = icon?.name;
    const Icon = IconMap[name as keyof typeof IconMap];
    if (Icon) {
      return <Icon width={32} height={32} {...props?.icon} />;
    }
    return (
      <Avatar
        icon={type === "team" ? <TeamOutlined /> : <UserOutlined />}
        {...props?.avatar}
        style={{
          background: icon?.color,
          ...props?.avatar?.style,
        }}
      />
    );
  }, [icon]);
  return render();
};
const IconMap = {
  ledger: Ledger,
  equity: Equity,
  vault: Vault,
  pulse: Pulse,
  nexus: Nexus,
  quantum: Quantum,
  yield: Yield,
  oracle: Oracle,
  vertex: Vertex,
  matrix: Matrix,
  flux: Flux,
  apex: Apex,
  cipher: Cipher,
  prism: Prism,
  horizon: Horizon,
  aura: Aura,
  node: Node,
  echo: Echo,
  nova: Nova,
  zenith: Zenith,
};
