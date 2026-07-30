import { describe, expect, it } from 'vitest';
import { analyzeAigcMetadata } from './aigcMetadata';

const declaration = {
  Label: '1',
  ContentProducer: '001191330106MA2CFLDG4R10001',
  ProduceID: 'U-cKrVYNeeQ5yCxSlo-lA0vA',
  ReservedCode1: 'K-example',
  ContentPropagator: '001191330106MA2CFLDG4R10001',
  PropagateID: 'U-cKrVYNeeQ5yCxSlo-lA0vA',
  ReservedCode2: 'K-example',
};

describe('analyzeAigcMetadata', () => {
  it('decodes the nested HTML-encoded Alibaba XMP representation', () => {
    const encoded = JSON.stringify(declaration).replace(/"/g, '&quot;');
    const report = analyzeAigcMetadata({ AIGC: { AIGC: encoded } });

    expect(report).toMatchObject({
      state: 'declared',
      declaration: 'generated',
      conformant: true,
      sourceKey: 'AIGC',
      provider: {
        id: 'provider.cn.tongyi-yunqi',
        confidence: 'high',
      },
      integrity: {
        state: 'unverified',
        reservedCodesEqual: true,
      },
    });
    expect(report.values?.produceId).toBe('U-cKrVYNeeQ5yCxSlo-lA0vA');
  });

  it('accepts a raw XMP or UserComment wrapper with a stringified AIGC object', () => {
    const xmp = `<rdf:Description AIGC:AIGC="{&quot;AIGC&quot;:${JSON.stringify(declaration).replace(/"/g, '&quot;')}}"/>`;
    const report = analyzeAigcMetadata({ xmp });

    expect(report.state).toBe('declared');
    expect(report.values?.label).toBe('1');
  });

  it('separates partial declarations from fully conformant metadata', () => {
    const report = analyzeAigcMetadata({
      'TC260:AIGC': JSON.stringify({ Label: '2', ContentProducer: 'Example Provider', ProduceID: 'id-1' }),
    });

    expect(report).toMatchObject({ state: 'partial', declaration: 'possibly-generated', conformant: false });
  });

  it('does not treat an unrelated mention of AIGC as a declaration', () => {
    expect(analyzeAigcMetadata({ Description: 'AIGC is discussed in this caption.' }).state).toBe('absent');
  });

  it('marks labelled candidates with invalid field values as malformed', () => {
    const report = analyzeAigcMetadata({ AIGC: { Label: '9', ContentProducer: 'Example', ProduceID: 'id-1' } });
    expect(report).toMatchObject({ state: 'invalid', malformedCandidateCount: 1 });
  });
});
