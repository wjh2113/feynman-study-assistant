export const DEMO_PROJECT_ID = "demo-pm-showcase";

export function isDemoProject(project) {
  return project?.id === DEMO_PROJECT_ID || project?.showcase === true;
}
