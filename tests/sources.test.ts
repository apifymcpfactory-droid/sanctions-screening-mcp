// Parser tests use small hand-written fixtures that mirror each official
// source's real schema (confirmed against the live files during development)
// rather than hitting the network in CI.

import { describe, expect, it } from 'vitest';

import { parseOfacXml } from '../src/lib/sources/ofac.js';
import { parseEuXml } from '../src/lib/sources/eu.js';
import { parseUkCsv } from '../src/lib/sources/uk.js';
import { parseUnXml } from '../src/lib/sources/un.js';

describe('parseOfacXml', () => {
    const xml = `<?xml version="1.0" standalone="yes"?>
<sdnList xmlns="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML">
  <publshInformation><Publish_Date>07/20/2026</Publish_Date><Record_Count>2</Record_Count></publshInformation>
  <sdnEntry>
    <uid>36</uid>
    <lastName>AEROCARIBBEAN AIRLINES</lastName>
    <sdnType>Entity</sdnType>
    <programList><program>CUBA</program></programList>
    <akaList><aka><uid>12</uid><type>a.k.a.</type><category>strong</category><lastName>AERO-CARIBBEAN</lastName></aka></akaList>
    <addressList><address><uid>25</uid><city>Havana</city><country>Cuba</country></address></addressList>
  </sdnEntry>
  <sdnEntry>
    <uid>1209</uid>
    <firstName>Abu</firstName>
    <lastName>ABBAS</lastName>
    <sdnType>Individual</sdnType>
    <programList><program>SDGT</program></programList>
    <akaList><aka><uid>1795</uid><type>a.k.a.</type><category>strong</category><lastName>ZAYDAN</lastName><firstName>Muhammad</firstName></aka></akaList>
  </sdnEntry>
</sdnList>`;

    it('parses entities and individuals with aliases, program and country', () => {
        const records = parseOfacXml(xml, 'OFAC SDN');
        expect(records).toHaveLength(2);

        const entity = records[0];
        expect(entity.entityId).toBe('OFAC SDN-36');
        expect(entity.entityType).toBe('org');
        expect(entity.primaryName).toBe('AEROCARIBBEAN AIRLINES');
        expect(entity.aliases).toEqual(['AERO-CARIBBEAN']);
        expect(entity.program).toBe('CUBA');
        expect(entity.country).toBe('Cuba');

        const person = records[1];
        expect(person.entityType).toBe('person');
        expect(person.primaryName).toBe('Abu ABBAS');
        expect(person.aliases).toEqual(['Muhammad ZAYDAN']);
    });
});

describe('parseEuXml', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export" generationDate="2026-07-20T10:05:36.338+02:00">
  <sanctionEntity euReferenceNumber="EU.27.28" logicalId="13">
    <remark>UNSC RESOLUTION 1483</remark>
    <regulation regulationType="regulation" programme="IRQ" logicalId="348"/>
    <subjectType code="person" classificationCode="P"/>
    <nameAlias firstName="Saddam" lastName="Hussein Al-Tikriti" wholeName="Saddam Hussein Al-Tikriti" strong="true" logicalId="17"/>
    <nameAlias wholeName="Abu Ali" strong="true" logicalId="19"/>
    <citizenship countryIso2Code="IQ" countryDescription="IRAQ" logicalId="1"/>
  </sanctionEntity>
</export>`;

    it('parses a person entity with primary name, aliases, programme and country', () => {
        const records = parseEuXml(xml);
        expect(records).toHaveLength(1);
        const [record] = records;
        expect(record.entityId).toBe('EU Consolidated-13');
        expect(record.entityType).toBe('person');
        expect(record.primaryName).toBe('Saddam Hussein Al-Tikriti');
        expect(record.aliases).toEqual(['Abu Ali']);
        expect(record.program).toBe('IRQ');
        expect(record.country).toBe('IRAQ');
    });
});

describe('parseUkCsv', () => {
    // 36 columns, in the real file's order - built from an object so column
    // count can never silently drift the way a hand-typed comma string could.
    const COLUMNS = [
        'Name 6',
        'Name 1',
        'Name 2',
        'Name 3',
        'Name 4',
        'Name 5',
        'Title',
        'Name Non-Latin Script',
        'Non-Latin Script Type',
        'Non-Latin Script Language',
        'DOB',
        'Town of Birth',
        'Country of Birth',
        'Nationality',
        'Passport Number',
        'Passport Details',
        'National Identification Number',
        'National Identification Details',
        'Position',
        'Address 1',
        'Address 2',
        'Address 3',
        'Address 4',
        'Address 5',
        'Address 6',
        'Post/Zip Code',
        'Country',
        'Other Information',
        'Group Type',
        'Alias Type',
        'Alias Quality',
        'Regime',
        'Listed On',
        'UK Sanctions List Date Designated',
        'Last Updated',
        'Group ID',
    ];

    function buildRow(fields: Partial<Record<(typeof COLUMNS)[number], string>>): string {
        return COLUMNS.map((col) => {
            const value = fields[col] ?? '';
            return value.includes(',') ? `"${value}"` : value;
        }).join(',');
    }

    const rows = [
        buildRow({
            'Name 6': 'HAQ',
            'Name 1': 'Mian',
            'Name 2': 'Abdul',
            Country: 'Pakistan',
            'Other Information': 'Statement of reasons.',
            'Group Type': 'Individual',
            'Alias Type': 'Primary name',
            Regime: 'Global Human Rights',
            'Group ID': '15672',
        }),
        buildRow({
            'Name 6': 'MITHOO',
            'Name 1': 'Mian',
            Country: 'Pakistan',
            'Group Type': 'Individual',
            'Alias Type': 'Primary name variation',
            Regime: 'Global Human Rights',
            'Group ID': '15672',
        }),
        buildRow({
            'Name 6': '2RIVERS DMCC',
            Country: 'United Arab Emirates',
            'Group Type': 'Entity',
            'Alias Type': 'Primary name',
            Regime: 'Russia',
            'Group ID': '99001',
        }),
    ];
    const csv = ['Last Updated,03/06/2026', COLUMNS.join(','), ...rows].join('\n');

    it('groups rows by Group ID and builds names in Name1..Name5,Name6 order', () => {
        const records = parseUkCsv(csv);
        expect(records).toHaveLength(2);

        const person = records.find((r) => r.entityId === 'UK OFSI-15672');
        expect(person?.primaryName).toBe('Mian Abdul HAQ');
        expect(person?.aliases).toEqual(['Mian MITHOO']);
        expect(person?.entityType).toBe('person');
        expect(person?.program).toBe('Global Human Rights');
        expect(person?.country).toBe('Pakistan');

        const org = records.find((r) => r.entityId === 'UK OFSI-99001');
        expect(org?.primaryName).toBe('2RIVERS DMCC');
        expect(org?.entityType).toBe('org');
        expect(org?.country).toBe('United Arab Emirates');
    });
});

describe('parseUnXml', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<CONSOLIDATED_LIST dateGenerated="2026-07-21T23:00:06.677Z">
  <INDIVIDUALS>
    <INDIVIDUAL>
      <DATAID>6907993</DATAID>
      <FIRST_NAME>ERIC</FIRST_NAME>
      <SECOND_NAME>BADEGE</SECOND_NAME>
      <UN_LIST_TYPE>DRC</UN_LIST_TYPE>
      <NATIONALITY><VALUE>Democratic Republic of the Congo</VALUE></NATIONALITY>
      <COMMENTS1>Some remark.</COMMENTS1>
      <INDIVIDUAL_ALIAS><QUALITY/><ALIAS_NAME/></INDIVIDUAL_ALIAS>
    </INDIVIDUAL>
  </INDIVIDUALS>
  <ENTITIES>
    <ENTITY>
      <DATAID>6908402</DATAID>
      <FIRST_NAME>ADF</FIRST_NAME>
      <UN_LIST_TYPE>DRC</UN_LIST_TYPE>
      <ENTITY_ALIAS><QUALITY>a.k.a.</QUALITY><ALIAS_NAME>Allied Democratic Forces</ALIAS_NAME></ENTITY_ALIAS>
      <ENTITY_ALIAS><QUALITY>f.k.a.</QUALITY><ALIAS_NAME>ADF/NALU</ALIAS_NAME></ENTITY_ALIAS>
    </ENTITY>
  </ENTITIES>
</CONSOLIDATED_LIST>`;

    it('parses both individuals and entities with aliases', () => {
        const records = parseUnXml(xml);
        expect(records).toHaveLength(2);

        const person = records.find((r) => r.entityId === 'UN Consolidated-6907993');
        expect(person?.entityType).toBe('person');
        expect(person?.primaryName).toBe('ERIC BADEGE');
        expect(person?.country).toBe('Democratic Republic of the Congo');
        expect(person?.aliases).toEqual([]);

        const org = records.find((r) => r.entityId === 'UN Consolidated-6908402');
        expect(org?.entityType).toBe('org');
        expect(org?.primaryName).toBe('ADF');
        expect(org?.aliases).toEqual(['Allied Democratic Forces', 'ADF/NALU']);
    });
});
