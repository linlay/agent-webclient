import Style from "./index.module.css";

interface LogoLoadingProps {
  size?: number;
}

export const LogoLoading: React.FC<LogoLoadingProps> = ({ size = 120 }) => {
  return (
    <div className={Style.wrapper}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 400 400"
        role="img"
        width={size}
        height={size}
      >
        <defs>
          <linearGradient
            id="brand-logo-blue-cyan-purple"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#EEF2FE" />
            <stop offset="50%" stopColor="#00A2FF" />
            <stop offset="100%" stopColor="#BB2BE2" />
          </linearGradient>
        </defs>
        <path
          className={Style.cloud}
          d="M 344.889 238.823
                             A 90 90 0 0 1 238.798 344.982
                             A 90 90 0 0 1 93.909 306.159
                             A 90 90 0 0 1 55.111 161.177
                             A 90 90 0 0 1 161.202 55.018
                             A 90 90 0 0 1 306.091 93.841
                             A 90 90 0 0 1 344.889 238.823 Z"
          fill="none"
          stroke="#49b7f9"
          strokeWidth="6"
          strokeDasharray="20"
        />
        <g
          fill="url(#brand-logo-blue-cyan-purple)"
          transform="translate(0, -20)"
        >
          <path d="M 120 135 Q 200 92 280 135 Q 200 132 120 135 Z" />
          <path d="M 60 180 Q 200 102 340 180 Q 200 173 60 180 Z" />
          <polygon points="231.5,190 278.5,190 168.5,290 121.5,290" />
          <rect x="115" y="290" width="170" height="25" />
        </g>
      </svg>
    </div>
  );
};
