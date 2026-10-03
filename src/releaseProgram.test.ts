import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SURFACE_ROUTE_PATHS } from "@/features/surfaces/lib/surfaceRoutes";

describe("isolated Program release inputs", () => {
  it("carries the build boundary checker in both native packaging scripts", () => {
    const sh = fs.readFileSync(path.resolve("scripts/release-program.sh"), "utf8");
    const ps = fs.readFileSync(path.resolve("scripts/release-program.ps1"), "utf8");
    expect(sh).toContain('require_file "$FEATURE_BOUNDARY_CHECKER"');
    expect(sh).toContain('node "$BUILD_WORKSPACE_PREPARER" --source "$REPO_ROOT" --build "$BUILD_ROOT" --version "$VERSION"');
    expect(ps).toContain('Test-Path -LiteralPath $FeatureBoundaryChecker -PathType Leaf');
    expect(ps).toContain('& node $BuildWorkspacePreparer --source $RepoRoot --build $BuildRoot --version $Version');
  });
  it("refuses to overwrite a release version before installing dependencies", () => {
    const sh = fs.readFileSync(path.resolve("scripts/release-program.sh"), "utf8");
    const ps = fs.readFileSync(path.resolve("scripts/release-program.ps1"), "utf8");
    const shGuard = sh.indexOf('release already exists: $target_archive');
    const shPrepare = sh.lastIndexOf("\nprepare_build_root\n");
    const psGuard = ps.indexOf('Release already exists: $archive');
    const psPrepare = ps.indexOf("& node $BuildWorkspacePreparer");
    for (const position of [shGuard, shPrepare, psGuard, psPrepare]) expect(position).toBeGreaterThan(-1);
    expect(shGuard).toBeLessThan(shPrepare);
    expect(psGuard).toBeLessThan(psPrepare);
    expect(ps).not.toContain("Remove-Item -LiteralPath $archive -Force");
  });
});

describe("Program manifest SPA routes", () => {
  it.each([
    ["darwin", "arm64"],
    ["windows", "amd64"],
  ])("declares canonical independent surface routes on %s/%s", (targetOS, targetArch) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "webclient-spa-routes-"));
    try {
      const output = path.join(root, "manifest.json");
      execFileSync(process.execPath, [
        path.resolve("scripts/render-program-manifest.mjs"),
        "--template", path.resolve("scripts/release-assets/program/manifest.template.json"),
        "--output", output,
        "--version", "v0.0.0",
        "--os", targetOS,
        "--arch", targetArch,
        "--asset", "fixture.tar.gz",
      ]);
      const manifest = JSON.parse(fs.readFileSync(output, "utf8"));
      const spaRoutes = manifest.desktop.hosting.spaRoutes as string[];
      expect(manifest.platform).toEqual({ os: targetOS, arch: targetArch });
      for (const route of Object.values(SURFACE_ROUTE_PATHS)) {
        // Dotted source IDs require an explicit SPA prefix; otherwise the
        // Desktop host treats a recalled .docx source as a missing static file.
        expect(spaRoutes).toContain(route.split(":")[0]);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
