import type { NavigationPointType } from '../../../src/domain/types.ts'
import { navigationPointTypeIds } from '../../../src/domain/navigation-point-types.ts'

export const officialNavigationTypeIds: Record<NavigationPointType, readonly string[]> = {
  'central-beacon': ['CS_01'],
  'small-beacon': ['CS_02'],
  'tacet-field': ['IconMap_WYQ'],
  'remnant-settlement': ['7010', '7011', '7012', '7013', '7014'],
  'nightmare-settlement': ['myjl'],
  'normal-boss': ['5021', '5023', '5025', '5026', '5027', '5028', '5029', '5030', '5031', '5032', '5033', '5035', '5036', '5038', '5039', '5040', '5041', '5042', '5044', '5045', '5034', '340000150'],
  'nightmare-boss': ['SP_IconMonsterHead_YZ_33014_UI', 'SP_IconMonsterHead_YZ_33015_UI', 'SP_IconMonsterHead_YZ_33016_UI', 'SP_IconMonsterHead_YZ_33017_UI', 'SP_IconMonsterHead_YZ_33018_UI', 'SP_IconMonsterHead_YZ_33019_UI', 'SP_IconMonsterHead_YZ_33020_UI', 'SP_IconMonsterHead_34013_UI', 'SP_IconMonsterHead_33021_UI', '340000160', '5043'],
  'weekly-boss': ['5022', '380015', '380016', '380021', '380043', '380044', '380102', '3130001', '3330002', '3530001', '3731001'],
  'material-domain': ['380002', '380003', '380004', '380006', '380007', '390054', '390055', '390056', '390057', '390058', '390066', '390067', '390068', '390069', '390070', '353002', 'Play_01', 'Play_01_1', '390071', '353001'],
  'hologram': ['Play_10', '4027', '4028', 'qxzl·dlzw'],
  'tower-of-adversity': ['Play_06'],
  'challenge': ['Activity_02', 'Activity_02_1', 'Play_04', 'Play_04+1', 'SP_IconActDreamB', 'SP_IconMap_Activity_17_UI', 'SP_IconMap_Activity_21_UI', 'SP_IconMap_Activity_23_UI'],
  'special-challenge': ['SP_IconMap_Activity_18_UI'],
  'regional-challenge': [],
  'gondola': ['GDLZT'],
  'dock': ['MT'],
  'wind-marker': ['FFZB'],
  'leap-device': ['48'],
  'layer-entrance': ['FCRK'],
  'hidden-entrance': ['YMRK'],
  'synthesizer': ['SP_IconMap_Shop_02_UI', 'SP_IconMap_Shop_02_UI_1', 'SP_IconMap_Shop_02_UI_2'],
  'weapon-service': ['SP_IconMap_Shop_07_UI', 'SP_IconMap_Shop_01_UI', '381035', '3510004'],
  'shop': ['SP_IconMap_Shop_08_UI', 'SP_IconMap_Shop_08_UI_1', 'SP_IconMap_Shop_08_UI_2', 'SP_IconMap_Shop_16_UI', '381033', '3510002', 'SP_IconMap_Shop_10_UI', 'SP_IconMap_Shop_10_UI_1', 'SP_IconMap_Shop_10_UI_2', 'SP_IconMap_Shop_11_UI', 'SP_IconMap_Shop_12_UI', 'SP_IconMap_Shop_13_UI', 'SP_IconMap_Shop_15_UI', 'SP_IconMap_Play_06_UI'],
  'restaurant': ['SP_IconMap_Shop_06_UI', 'SP_IconMap_Shop_06_UI_1', 'SP_IconMap_Shop_06_UI_2', 'SP_IconMap_Shop_06_UI_3', 'SP_IconMap_Shop_06_UI_4', '381034', '3510001'],
  'medical': ['SP_IconMap_Shop_03_UI', 'SP_IconMap_Shop_03_UI_1', 'SP_IconMap_Shop_03_UI_2', '381032', '3510005'],
  'collection-delivery': ['SP_IconMap_Play_24_UI', 'SP_IconMap_Play_24_UI_1', '381036', '381037'],
  'service': ['SP_IconMap_Play_07_UI', 'SP_IconMap_Play_07_UI_1', 'SP_IconMap_Play_13_UI', 'SP_IconMap_Play_25_UI', 'SP_IconMap_Play_38_UI', 'SP_IconMap_Play_39_UI', 'SP_IconMap_Play_42_UI', 'SP_IconMap_Play_46_UI', 'SP_IconMap_Activity_HonamiStory_UI', 'SP_IconMap_Activity_Navigation_7_UI', 'Play_03', 'Play_03_1', 'Play_03_2', 'Play_04_1', 'Play_04_2', '381031', '381038', '342011', '3330003', '3510007', '3510008'],
}

const officialTypes = new Map(navigationPointTypeIds.flatMap((type) => officialNavigationTypeIds[type].map((id) => [id, type] as const)))

export function officialNavigationPointType(typeId: string): NavigationPointType | undefined {
  return officialTypes.get(typeId)
}
