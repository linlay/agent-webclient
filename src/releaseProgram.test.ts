import fs from "node:fs";
import path from "node:path";

describe("isolated Program release inputs", () => {
  it("carries the build boundary checker in both native packaging scripts", () => {
    const sh = fs.readFileSync(path.resolve("scripts/release-program.sh"), "utf8");
    const ps = fs.readFileSync(path.resolve("scripts/release-program.ps1"), "utf8");
    expect(sh).toContain('require_file "$FEATURE_BOUNDARY_CHECKER"');
    expect(sh).toContain('cp "$FEATURE_BOUNDARY_CHECKER" "$BUILD_ROOT/scripts/check-feature-boundaries.js"');
    expect(ps).toContain('Test-Path -LiteralPath $FeatureBoundaryChecker -PathType Leaf');
    expect(ps).toContain('Copy-Item -LiteralPath $FeatureBoundaryChecker -Destination (Join-Path $BuildScriptsDir "check-feature-boundaries.js")');
  });
  it("refuses to overwrite a release version before installing dependencies", () => {
    const sh = fs.readFileSync(path.resolve("scripts/release-program.sh"), "utf8");
    const ps = fs.readFileSync(path.resolve("scripts/release-program.ps1"), "utf8");
    expect(sh.indexOf('release already exists: $target_archive')).toBeLessThan(sh.lastIndexOf("install_build_dependencies"));
    expect(ps.indexOf('Release already exists: $archive')).toBeLessThan(ps.indexOf("& npm ci"));
    expect(ps).not.toContain("Remove-Item -LiteralPath $archive -Force");
  });
});
