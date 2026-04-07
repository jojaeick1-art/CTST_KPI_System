export type ProfileRole = "admin" | "leader" | "employee";

export type ProfileRow = {
  id: string;
  username: string;
  role: ProfileRole;
};
