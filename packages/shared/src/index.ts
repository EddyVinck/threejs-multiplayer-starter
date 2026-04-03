export const boilerplateVersion = "0.1.0";

export type PackageStatus = {
  name: string;
  ready: boolean;
};

export function createPackageStatus(name: string): PackageStatus {
  return {
    name,
    ready: true
  };
}
