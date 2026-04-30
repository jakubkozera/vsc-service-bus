import { describe, it, expect } from 'vitest';

// Test parsera ISO 8601
function parseISO8601Duration(iso: string): { days: number; hours: number; minutes: number; seconds: number } {
  const parts = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  if (!iso || !iso.startsWith('P')) return parts;

  if (iso === 'P10675199DT2H48M5.4775807S') {
    return parts;
  }

  let remaining = iso.substring(1);
  
  const daysMatch = remaining.match(/^(\d+)D/);
  if (daysMatch) {
    parts.days = parseInt(daysMatch[1], 10);
    remaining = remaining.substring(daysMatch[0].length);
  }
  
  if (remaining.startsWith('T')) {
    remaining = remaining.substring(1);
    
    const hoursMatch = remaining.match(/^(\d+)H/);
    if (hoursMatch) {
      parts.hours = parseInt(hoursMatch[1], 10);
      remaining = remaining.substring(hoursMatch[0].length);
    }
    
    const minutesMatch = remaining.match(/^(\d+)M/);
    if (minutesMatch) {
      parts.minutes = parseInt(minutesMatch[1], 10);
      remaining = remaining.substring(minutesMatch[0].length);
    }
    
    const secondsMatch = remaining.match(/^(\d+(?:\.\d+)?)S/);
    if (secondsMatch) {
      parts.seconds = parseInt(secondsMatch[1], 10);
    }
  }
  
  return parts;
}

describe('parseISO8601Duration', () => {
  it('should parse P14D (14 days)', () => {
    const result = parseISO8601Duration('P14D');
    expect(result).toEqual({ days: 14, hours: 0, minutes: 0, seconds: 0 });
  });

  it('should parse PT1M (1 minute)', () => {
    const result = parseISO8601Duration('PT1M');
    expect(result).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 0 });
  });

  it('should parse PT30S (30 seconds)', () => {
    const result = parseISO8601Duration('PT30S');
    expect(result).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 30 });
  });

  it('should parse P1DT2H30M (1 day, 2 hours, 30 minutes)', () => {
    const result = parseISO8601Duration('P1DT2H30M');
    expect(result).toEqual({ days: 1, hours: 2, minutes: 30, seconds: 0 });
  });

  it('should parse P7D (7 days)', () => {
    const result = parseISO8601Duration('P7D');
    expect(result).toEqual({ days: 7, hours: 0, minutes: 0, seconds: 0 });
  });
});
