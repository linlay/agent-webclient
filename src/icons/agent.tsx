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
      </defs>

      <rect
        x="12"
        y="12"
        width="24"
        height="24"
        transform="rotate(45 24 24)"
        fill="url(#g1)"
        opacity="0.8"
      ></rect>
      <rect
        x="6"
        y="6"
        width="36"
        height="36"
        transform="rotate(45 24 24)"
        stroke="url(#g1)"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
      ></rect>
      <circle cx="24" cy="7" r="3" fill="url(#g1)"></circle>
      <circle cx="24" cy="41" r="3" fill="url(#g1)"></circle>
      <circle cx="7" cy="24" r="3" fill="url(#g1)"></circle>
      <circle cx="41" cy="24" r="3" fill="url(#g1)"></circle>
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
        d="M24 4 A 20 20 0 0 1 44 24 L 24 24 Z"
        fill="url(#g2)"
        opacity="0.9"
      ></path>
      <path
        d="M44 24 A 20 20 0 1 1 24 4 L 24 24 Z"
        stroke="url(#g2)"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
      ></path>
      <path
        d="M30 18 L 40 8"
        stroke="url(#g2)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.8"
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

      <polygon
        points="24,4 41.3,14 41.3,34 24,44 6.7,34 6.7,14"
        stroke="url(#g3)"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
      ></polygon>
      <polygon
        points="24,12 34.4,18 34.4,30 24,36 13.6,30 13.6,18"
        fill="url(#g3)"
        opacity="0.8"
      ></polygon>
      <circle cx="24" cy="24" r="4" fill="#ffffff" opacity="0.9"></circle>
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
        d="M4 24 Q 14 4 24 24 T 44 24"
        stroke="url(#g4)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.4"
      ></path>
      <path
        d="M4 32 Q 14 12 24 32 T 44 32"
        stroke="url(#g4)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      ></path>
      <circle cx="24" cy="32" r="4" fill="url(#g4)"></circle>
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

      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="6"
        transform="rotate(45 24 24)"
        stroke="url(#g5)"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      ></ellipse>
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="6"
        transform="rotate(-45 24 24)"
        stroke="url(#g5)"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      ></ellipse>
      <circle cx="24" cy="24" r="10" fill="url(#g5)" opacity="0.9"></circle>
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

      <rect
        x="8"
        y="8"
        width="32"
        height="32"
        stroke="url(#g6)"
        strokeWidth="2"
        fill="none"
        opacity="0.3"
      ></rect>
      <rect
        x="16"
        y="16"
        width="16"
        height="16"
        fill="url(#g6)"
        opacity="0.8"
      ></rect>
      <line
        x1="8"
        y1="8"
        x2="16"
        y2="16"
        stroke="url(#g6)"
        strokeWidth="2"
        opacity="0.6"
      ></line>
      <line
        x1="40"
        y1="8"
        x2="32"
        y2="16"
        stroke="url(#g6)"
        strokeWidth="2"
        opacity="0.6"
      ></line>
      <line
        x1="8"
        y1="40"
        x2="16"
        y2="32"
        stroke="url(#g6)"
        strokeWidth="2"
        opacity="0.6"
      ></line>
      <line
        x1="40"
        y1="40"
        x2="32"
        y2="32"
        stroke="url(#g6)"
        strokeWidth="2"
        opacity="0.6"
      ></line>
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

      <path
        d="M10 38 L 24 24 L 38 38"
        stroke="url(#g7)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.3"
      ></path>
      <path
        d="M10 28 L 24 14 L 38 28"
        stroke="url(#g7)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      ></path>
      <path d="M10 18 L 24 4 L 38 18" fill="url(#g7)" opacity="0.9"></path>
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
        d="M4 24 C 14 8 34 8 44 24 C 34 40 14 40 4 24 Z"
        stroke="url(#g8)"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
      ></path>
      <circle cx="24" cy="24" r="10" fill="url(#g8)" opacity="0.8"></circle>
      <circle cx="26" cy="22" r="3" fill="#ffffff" opacity="0.9"></circle>
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

      <polygon
        points="24,4 44,40 24,32 4,40"
        fill="url(#g9)"
        opacity="0.8"
      ></polygon>
      <polygon
        points="24,4 44,40 24,32 4,40"
        stroke="url(#g9)"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
        transform="scale(1.1) translate(-2, -2)"
      ></polygon>
      <line
        x1="24"
        y1="4"
        x2="24"
        y2="32"
        stroke="#ffffff"
        strokeWidth="2"
        opacity="0.4"
      ></line>
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

      <path
        d="M8 36 L 16 12 L 40 12 L 32 36 Z"
        stroke="url(#g10)"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
      ></path>
      <path
        d="M16 24 L 36 24 M 22 12 L 18 36 M 34 12 L 30 36"
        stroke="url(#g10)"
        strokeWidth="2"
        opacity="0.4"
      ></path>
      <circle cx="26" cy="24" r="6" fill="url(#g10)" opacity="0.9"></circle>
      <circle cx="34" cy="12" r="4" fill="url(#g10)" opacity="0.6"></circle>
      <circle cx="18" cy="36" r="4" fill="url(#g10)" opacity="0.6"></circle>
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
        d="M8 36 C 8 12 40 12 40 36"
        stroke="url(#g11)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.4"
      ></path>
      <path
        d="M40 12 C 40 36 8 36 8 12"
        stroke="url(#g11)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      ></path>
      <circle cx="24" cy="24" r="5" fill="url(#g11)"></circle>
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
        d="M4 40 L 20 16 L 30 26 L 44 6 L 44 40 Z"
        fill="url(#g12)"
        opacity="0.3"
      ></path>
      <path
        d="M4 40 L 20 16 L 30 26 L 44 6"
        stroke="url(#g12)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      ></path>
      <circle cx="44" cy="6" r="4" fill="url(#g12)"></circle>
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

      <circle
        cx="24"
        cy="24"
        r="20"
        stroke="url(#g13)"
        strokeWidth="2"
        strokeDasharray="10 6"
        fill="none"
        opacity="0.4"
      ></circle>
      <circle
        cx="24"
        cy="24"
        r="14"
        stroke="url(#g13)"
        strokeWidth="2"
        strokeDasharray="20 8"
        fill="none"
        opacity="0.6"
      ></circle>
      <path
        d="M24 16 A 8 8 0 1 1 16 24"
        stroke="url(#g13)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      ></path>
      <circle cx="24" cy="24" r="4" fill="url(#g13)"></circle>
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

      <polygon
        points="24,4 40,12 40,36 24,44 8,36 8,12"
        stroke="url(#g14)"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
      ></polygon>
      <polygon
        points="24,4 40,12 24,24 8,12"
        fill="url(#g14)"
        opacity="0.6"
      ></polygon>
      <polygon
        points="8,12 24,24 24,44 8,36"
        fill="url(#g14)"
        opacity="0.3"
      ></polygon>
      <polygon
        points="40,12 24,24 24,44 40,36"
        fill="url(#g14)"
        opacity="0.9"
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
        d="M4 32 Q 24 20 44 32"
        stroke="url(#g15)"
        strokeWidth="3"
        fill="none"
        opacity="0.5"
      ></path>
      <path
        d="M4 40 Q 24 28 44 40"
        stroke="url(#g15)"
        strokeWidth="4"
        fill="none"
        opacity="0.9"
      ></path>
      <circle cx="24" cy="16" r="8" fill="url(#g15)" opacity="0.8"></circle>
    </svg>
  );
};
const Aura: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="g16" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047"></stop>
          <stop offset="100%" stopColor="#A16207"></stop>
        </linearGradient>
      </defs>

      <circle
        cx="18"
        cy="18"
        r="12"
        fill="url(#g16)"
        opacity="0.5"
        style={{ mixBlendMode: "multiply" }}
      ></circle>
      <circle
        cx="30"
        cy="18"
        r="12"
        fill="url(#g16)"
        opacity="0.7"
        style={{ mixBlendMode: "multiply" }}
      ></circle>
      <circle
        cx="24"
        cy="30"
        r="12"
        fill="url(#g16)"
        opacity="0.9"
        style={{ mixBlendMode: "multiply" }}
      ></circle>
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke="url(#g16)"
        strokeWidth="1"
        fill="none"
        opacity="0.3"
      ></circle>
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

      <path
        d="M24 24 L 24 8 M 24 24 L 38 32 M 24 24 L 10 32"
        stroke="url(#g17)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      ></path>
      <circle cx="24" cy="24" r="8" fill="url(#g17)" opacity="0.9"></circle>
      <circle cx="24" cy="8" r="4" fill="url(#g17)" opacity="0.6"></circle>
      <circle cx="38" cy="32" r="4" fill="url(#g17)" opacity="0.6"></circle>
      <circle cx="10" cy="32" r="4" fill="url(#g17)" opacity="0.6"></circle>
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

      <circle cx="16" cy="24" r="12" fill="url(#g18)" opacity="0.8"></circle>
      <circle
        cx="24"
        cy="24"
        r="16"
        stroke="url(#g18)"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      ></circle>
      <circle
        cx="32"
        cy="24"
        r="20"
        stroke="url(#g18)"
        strokeWidth="2"
        fill="none"
        opacity="0.2"
      ></circle>
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

      <polygon
        points="24,2 28,18 44,24 28,30 24,46 20,30 4,24 20,18"
        fill="url(#g19)"
        opacity="0.8"
      ></polygon>
      <polygon
        points="24,10 26,22 38,24 26,26 24,38 22,26 10,24 22,22"
        stroke="#ffffff"
        strokeWidth="1"
        fill="none"
        opacity="0.6"
      ></polygon>
      <circle cx="24" cy="24" r="3" fill="#ffffff"></circle>
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

      <rect
        x="18"
        y="8"
        width="12"
        height="28"
        rx="2"
        fill="url(#g20)"
        opacity="0.9"
      ></rect>
      <path
        d="M10 40 Q 24 32 38 40"
        stroke="url(#g20)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      ></path>
      <path
        d="M14 16 L 34 16 M 14 24 L 34 24"
        stroke="url(#g20)"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
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
