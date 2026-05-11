export function getShotTypeLabel(shotType: string) {
  if (shotType === 'A-Roll') return 'พูดหน้ากล้อง';
  if (shotType === 'B-Roll') return 'ถ่าย insert';
  return shotType;
}
