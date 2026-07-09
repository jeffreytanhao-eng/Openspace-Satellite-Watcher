import { TLE_LINE1_REGEX, TLE_LINE2_REGEX, TLE_NAME_REGEX } from './constants';

export interface TLEOrbitalElements {
  noradId: string;
  inclination: number;
  raan: number;
  eccentricity: number;
  argPerigee: number;
  meanAnomaly: number;
  meanMotion: number;
  revolutionNumber: number;
}

export interface TLEData {
  name: string;
  noradId: string;
  line1: string;
  line2: string;
  epoch: Date;
  elements: TLEOrbitalElements;
}

export interface TLEParseError {
  code: string;
  message: string;
  line?: number;
}

export interface TLEParseResult {
  success: boolean;
  data?: TLEData;
  errors?: TLEParseError[];
}

function calculateChecksum(line: string): number {
  let sum = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const char = line[i];
    if (!isNaN(parseInt(char, 10))) {
      sum += parseInt(char, 10);
    } else if (char === '-') {
      sum += 1;
    }
  }
  return sum % 10;
}

function validateChecksum(line: string): boolean {
  if (line.length < 69) return false;
  const expectedChecksum = parseInt(line[line.length - 1], 10);
  const calculatedChecksum = calculateChecksum(line);
  return expectedChecksum === calculatedChecksum;
}

function parseEpoch(year: string, day: string, fraction: string): Date {
  const fullYear = parseInt(year, 10) >= 57 ? 1900 + parseInt(year, 10) : 2000 + parseInt(year, 10);
  const dayOfYear = parseFloat(day + '.' + fraction);
  
  const date = new Date(fullYear, 0, 0);
  const milliseconds = dayOfYear * 24 * 60 * 60 * 1000;
  date.setTime(date.getTime() + milliseconds);
  
  return date;
}

export function parseTLE(tleText: string): TLEParseResult {
  const errors: TLEParseError[] = [];
  const lines = tleText.trim().split('\n').map(line => line.trim());
  
  if (lines.length < 2) {
    errors.push({ code: 'INVALID_FORMAT', message: 'TLE 数据至少需要两行（Line1 + Line2）' });
    return { success: false, errors };
  }
  
  const hasName = lines.length === 3;
  const name = hasName ? lines[0] : '';
  const line1 = hasName ? lines[1] : lines[0];
  const line2 = hasName ? lines[2] : lines[1];
  
  if (hasName) {
    if (name.length > 24) {
      errors.push({ code: 'INVALID_NAME', message: '卫星名称不能超过 24 个字符', line: 1 });
    }
    if (!TLE_NAME_REGEX.test(name.replace(/\s+/g, ''))) {
      errors.push({ code: 'INVALID_NAME', message: '卫星名称只能包含大写字母、数字和空格', line: 1 });
    }
  }
  
  if (!line1.startsWith('1 ')) {
    errors.push({ code: 'INVALID_LINE1', message: 'Line1 必须以 "1 " 开头', line: hasName ? 2 : 1 });
  }
  
  if (!line2.startsWith('2 ')) {
    errors.push({ code: 'INVALID_LINE2', message: 'Line2 必须以 "2 " 开头', line: hasName ? 3 : 2 });
  }
  
  if (line1.length !== 69) {
    errors.push({ code: 'INVALID_LINE1_LENGTH', message: `Line1 长度应为 69 字符，实际为 ${line1.length}`, line: hasName ? 2 : 1 });
  }
  
  if (line2.length !== 69) {
    errors.push({ code: 'INVALID_LINE2_LENGTH', message: `Line2 长度应为 69 字符，实际为 ${line2.length}`, line: hasName ? 3 : 2 });
  }
  
  if (!validateChecksum(line1)) {
    errors.push({ code: 'INVALID_LINE1_CHECKSUM', message: 'Line1 校验和验证失败', line: hasName ? 2 : 1 });
  }
  
  if (!validateChecksum(line2)) {
    errors.push({ code: 'INVALID_LINE2_CHECKSUM', message: 'Line2 校验和验证失败', line: hasName ? 3 : 2 });
  }
  
  const line1Match = line1.match(TLE_LINE1_REGEX);
  const line2Match = line2.match(TLE_LINE2_REGEX);
  
  if (!line1Match) {
    errors.push({ code: 'INVALID_LINE1_FORMAT', message: 'Line1 格式不符合标准 TLE 规范', line: hasName ? 2 : 1 });
  }
  
  if (!line2Match) {
    errors.push({ code: 'INVALID_LINE2_FORMAT', message: 'Line2 格式不符合标准 TLE 规范', line: hasName ? 3 : 2 });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  const noradId1 = line1Match![1];
  const noradId2 = line2Match![1];
  
  if (noradId1 !== noradId2) {
    errors.push({ code: 'MISMATCHED_NORAD_ID', message: `Line1 和 Line2 的 NORAD ID 不匹配: ${noradId1} vs ${noradId2}` });
    return { success: false, errors };
  }
  
  const epoch = parseEpoch(
    line1Match![2],
    line1Match![3],
    line1Match![4].slice(1)
  );
  
  const elements: TLEOrbitalElements = {
    noradId: noradId1,
    inclination: parseFloat(line2Match![2] + '.' + line2Match![3]),
    raan: parseFloat(line2Match![4] + '.' + line2Match![5]),
    eccentricity: parseFloat('0.' + line2Match![6]),
    argPerigee: parseFloat(line2Match![7] + '.' + line2Match![8]),
    meanAnomaly: parseFloat(line2Match![9] + '.' + line2Match![10]),
    meanMotion: parseFloat(line2Match![11] + '.' + line2Match![12]),
    revolutionNumber: parseInt(line1Match![11] + line1Match![12], 10)
  };
  
  return {
    success: true,
    data: {
      name: name.trim(),
      noradId: noradId1,
      line1,
      line2,
      epoch,
      elements
    }
  };
}

export function validateTLE(tleText: string): TLEParseError[] {
  const result = parseTLE(tleText);
  return result.errors || [];
}