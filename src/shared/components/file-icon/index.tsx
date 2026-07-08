import React from "react";
import Style from "./index.module.css";

import angularSvg from "./icons/angular.svg";
import cppSvg from "./icons/cpp.svg";
import csharpSvg from "./icons/csharp.svg";
import cssSvg from "./icons/css.svg";
import databaseSvg from "./icons/database.svg";
import excelSvg from "./icons/excel.svg";
import fileSvg from "./icons/file.svg";
import gitSvg from "./icons/git.svg";
import goSvg from "./icons/go.svg";
import htmlSvg from "./icons/html.svg";
import imageSvg from "./icons/image.svg";
import javaSvg from "./icons/java.svg";
import javascriptSvg from "./icons/javascript.svg";
import jsonSvg from "./icons/json.svg";
import mdxSvg from "./icons/mdx.svg";
import pdfSvg from "./icons/pdf.svg";
import phpSvg from "./icons/php.svg";
import powerpointSvg from "./icons/powerpoint.svg";
import powershellSvg from "./icons/powershell.svg";
import pythonSvg from "./icons/python.svg";
import rubySvg from "./icons/ruby.svg";
import rustSvg from "./icons/rust.svg";
import sassSvg from "./icons/sass.svg";
import typescriptSvg from "./icons/typescript.svg";
import vueSvg from "./icons/vue.svg";
import wordSvg from "./icons/word.svg";
import xmlSvg from "./icons/xml.svg";
import yamlSvg from "./icons/yaml.svg";
import zipSvg from "./icons/zip.svg";
import reactSvg from "./icons/react.svg";

export interface FileIconProps {
  filename: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const EXT_ICON_MAP: Record<string, string> = {
  ts: typescriptSvg,
  tsx: reactSvg,
  js: javascriptSvg,
  jsx: reactSvg,
  mjs: javascriptSvg,
  cjs: javascriptSvg,
  json: jsonSvg,
  css: cssSvg,
  scss: sassSvg,
  sass: sassSvg,
  less: cssSvg,
  html: htmlSvg,
  htm: htmlSvg,
  md: mdxSvg,
  mdx: mdxSvg,
  py: pythonSvg,
  pyx: pythonSvg,
  java: javaSvg,
  kt: javaSvg,
  kts: javaSvg,
  swift: fileSvg,
  c: cppSvg,
  cpp: cppSvg,
  cc: cppSvg,
  cxx: cppSvg,
  h: cppSvg,
  hpp: cppSvg,
  go: goSvg,
  rs: rustSvg,
  rb: rubySvg,
  php: phpSvg,
  sh: powershellSvg,
  bash: powershellSvg,
  bashrc: powershellSvg,
  zsh: powershellSvg,
  zshrc: powershellSvg,
  fish: powershellSvg,
  ps1: powershellSvg,
  yml: yamlSvg,
  yaml: yamlSvg,
  xml: xmlSvg,
  sql: databaseSvg,
  graphql: fileSvg,
  gql: fileSvg,
  gitignore: gitSvg,
  gitattributes: gitSvg,
  png: imageSvg,
  jpg: imageSvg,
  jpeg: imageSvg,
  gif: imageSvg,
  webp: imageSvg,
  ico: imageSvg,
  bmp: imageSvg,
  svg: imageSvg,
  pdf: pdfSvg,
  zip: zipSvg,
  tar: zipSvg,
  gz: zipSvg,
  rar: zipSvg,
  "7z": zipSvg,
  bz2: zipSvg,
  xz: zipSvg,
  tgz: zipSvg,
  mp3: fileSvg,
  wav: fileSvg,
  ogg: fileSvg,
  flac: fileSvg,
  aac: fileSvg,
  mp4: fileSvg,
  webm: fileSvg,
  mov: fileSvg,
  avi: fileSvg,
  mkv: fileSvg,
  ttf: fileSvg,
  woff: fileSvg,
  woff2: fileSvg,
  otf: fileSvg,
  eot: fileSvg,
  xls: excelSvg,
  xlsx: excelSvg,
  csv: excelSvg,
  ppt: powerpointSvg,
  pptx: powerpointSvg,
  doc: wordSvg,
  docx: wordSvg,
  toml: fileSvg,
  ini: fileSvg,
  cfg: fileSvg,
  conf: fileSvg,
  properties: fileSvg,
  lock: fileSvg,
  env: fileSvg,
  vue: vueSvg,
  svelte: vueSvg,
  dart: fileSvg,
  lua: fileSvg,
  r: fileSvg,
  rmd: mdxSvg,
  scala: fileSvg,
  sc: fileSvg,
  elm: fileSvg,
  ex: fileSvg,
  exs: fileSvg,
  erl: fileSvg,
  hrl: fileSvg,
  hs: fileSvg,
  lhs: fileSvg,
  clj: fileSvg,
  cljs: fileSvg,
  edn: fileSvg,
  cs: csharpSvg,
  csproj: csharpSvg,
  fs: fileSvg,
  fsx: fileSvg,
  fsproj: fileSvg,
  vb: fileSvg,
  pl: fileSvg,
  pm: fileSvg,
  txt: fileSvg,
  log: fileSvg,
};

const FULLNAME_ICON_MAP: Record<string, string> = {
  dockerfile: fileSvg,
  ".dockerignore": fileSvg,
  makefile: fileSvg,
  "package-lock.json": jsonSvg,
  "yarn.lock": fileSvg,
  "pnpm-lock.yaml": fileSvg,
  "gemfile.lock": fileSvg,
  license: fileSvg,
  changelog: fileSvg,
  contributing: mdxSvg,
  "angular.json": angularSvg,
};

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

function getIconSrc(filename: string): string {
  const lower = filename.toLowerCase();
  const special = FULLNAME_ICON_MAP[lower];
  if (special) return special;
  if (lower.startsWith("dockerfile")) return fileSvg;
  const ext = getFileExtension(filename);
  if (ext && EXT_ICON_MAP[ext]) return EXT_ICON_MAP[ext];
  return fileSvg;
}

export const FileIcon: React.FC<FileIconProps> = ({
  filename,
  size = 24,
  className,
  style,
}) => {
  const src = getIconSrc(filename);
  const classNames = [Style.FileIcon, className].filter(Boolean).join(" ");

  return (
    <span className={classNames} style={style}>
      <img
        src={src}
        alt={filename}
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    </span>
  );
};
