import { timeZoneList } from "@/lib/time";

/** Picker over every IANA timezone, so a typo can't be saved. */
export function TimeZoneSelect({ id, name, defaultValue }: { id: string; name: string; defaultValue: string }) {
  const zones = timeZoneList();
  return (
    <select id={id} name={name} defaultValue={defaultValue}>
      {!zones.includes(defaultValue) && <option value={defaultValue}>{defaultValue}</option>}
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
