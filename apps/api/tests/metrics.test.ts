import {
  calculateCTR,
  calculateApplicationRate,
  calculateInterviewRate,
  calculateHireRate,
  calculateCPC,
  calculateCPA,
  calculateCPQA,
  calculateCPH,
  calculateDelta,
} from '../src/modules/analytics/metrics';

describe('Analytics Metrics Pure Functions', () => {
  describe('calculateCTR (clicks / impressions)', () => {
    it('calculates correct CTR for valid inputs', () => {
      expect(calculateCTR(50, 1000)).toBe(0.05);
      expect(calculateCTR(0, 500)).toBe(0);
    });

    it('returns null on zero or invalid impressions', () => {
      expect(calculateCTR(10, 0)).toBeNull();
      expect(calculateCTR(10, -5)).toBeNull();
      expect(calculateCTR(-2, 100)).toBeNull();
    });
  });

  describe('calculateApplicationRate (applications / clicks)', () => {
    it('calculates correct application rate for valid inputs', () => {
      expect(calculateApplicationRate(20, 200)).toBe(0.1);
      expect(calculateApplicationRate(0, 100)).toBe(0);
    });

    it('returns null on zero or invalid clicks', () => {
      expect(calculateApplicationRate(10, 0)).toBeNull();
      expect(calculateApplicationRate(10, -10)).toBeNull();
      expect(calculateApplicationRate(-5, 100)).toBeNull();
    });
  });

  describe('calculateInterviewRate (interviews / applications)', () => {
    it('calculates correct interview rate', () => {
      expect(calculateInterviewRate(5, 50)).toBe(0.1);
      expect(calculateInterviewRate(0, 25)).toBe(0);
    });

    it('returns null on zero or invalid applications', () => {
      expect(calculateInterviewRate(5, 0)).toBeNull();
      expect(calculateInterviewRate(5, -1)).toBeNull();
    });
  });

  describe('calculateHireRate (hires / applications)', () => {
    it('calculates correct hire rate', () => {
      expect(calculateHireRate(2, 40)).toBe(0.05);
      expect(calculateHireRate(0, 10)).toBe(0);
    });

    it('returns null on zero or invalid applications', () => {
      expect(calculateHireRate(2, 0)).toBeNull();
    });
  });

  describe('calculateCPC (spend / clicks)', () => {
    it('calculates correct cost per click', () => {
      expect(calculateCPC(500, 100)).toBe(5);
      expect(calculateCPC(0, 50)).toBe(0);
    });

    it('returns null on zero or invalid clicks/spend', () => {
      expect(calculateCPC(100, 0)).toBeNull();
      expect(calculateCPC(100, -10)).toBeNull();
      expect(calculateCPC(-50, 10)).toBeNull();
    });
  });

  describe('calculateCPA (spend / applications)', () => {
    it('calculates correct cost per application', () => {
      expect(calculateCPA(1000, 25)).toBe(40);
    });

    it('returns null on zero applications', () => {
      expect(calculateCPA(1000, 0)).toBeNull();
    });
  });

  describe('calculateCPQA (spend / qualifiedApplications)', () => {
    it('calculates correct cost per qualified application', () => {
      expect(calculateCPQA(1200, 15)).toBe(80);
    });

    it('returns null on zero qualified applications', () => {
      expect(calculateCPQA(1200, 0)).toBeNull();
    });
  });

  describe('calculateCPH (spend / hires)', () => {
    it('calculates correct cost per hire', () => {
      expect(calculateCPH(10000, 2)).toBe(5000);
    });

    it('returns null on zero hires', () => {
      expect(calculateCPH(10000, 0)).toBeNull();
    });
  });

  describe('calculateDelta', () => {
    it('calculates positive and negative percentage changes', () => {
      expect(calculateDelta(120, 100)).toBe(20);
      expect(calculateDelta(80, 100)).toBe(-20);
      expect(calculateDelta(100, 100)).toBe(0);
    });

    it('returns null when previous value is zero, null, or undefined', () => {
      expect(calculateDelta(100, 0)).toBeNull();
      expect(calculateDelta(100, null)).toBeNull();
      expect(calculateDelta(100, undefined)).toBeNull();
      expect(calculateDelta(null, 50)).toBeNull();
    });
  });
});
