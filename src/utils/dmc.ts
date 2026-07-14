import { DMCColor } from '../types';

export const DMC_COLORS: DMCColor[] = [
  // Grays/Blacks/Whites
  { code: '310', name: 'Black', r: 0, g: 0, b: 0, hex: '#000000' },
  { code: 'B5200', name: 'Bright White', r: 255, g: 255, b: 255, hex: '#FFFFFF' },
  { code: '3865', name: 'Winter White', r: 247, g: 245, b: 238, hex: '#F7F5EE' },
  { code: '415', name: 'Chrome Gray', r: 211, g: 213, b: 218, hex: '#D3D5DA' },
  { code: '317', name: 'Pewter Gray', r: 108, g: 111, b: 114, hex: '#6C6F72' },
  { code: '413', name: 'Pewter Gray Dark', r: 86, g: 87, b: 89, hex: '#565759' },
  
  // Reds
  { code: '666', name: 'Bright Red', r: 227, g: 29, b: 66, hex: '#E31D42' },
  { code: '321', name: 'Red', r: 195, g: 18, b: 48, hex: '#C31230' },
  { code: '817', name: 'Coral Red Very Dark', r: 187, g: 5, b: 31, hex: '#BB051F' },
  { code: '304', name: 'Red Medium', r: 179, g: 22, b: 46, hex: '#B3162E' },
  { code: '498', name: 'Dark Red', r: 140, g: 4, b: 27, hex: '#8C041B' },
  { code: '815', name: 'Garnet Medium', r: 117, g: 12, b: 29, hex: '#750C1D' },
  
  // Pinks/Roses
  { code: '602', name: 'Cranberry Medium', r: 224, g: 46, b: 113, hex: '#E02E71' },
  { code: '605', name: 'Cranberry Very Light', r: 255, g: 201, b: 215, hex: '#FFC9D7' },
  { code: '760', name: 'Salmon Pink', r: 243, g: 161, b: 154, hex: '#F3A19A' },
  { code: '818', name: 'Baby Pink', r: 255, g: 223, b: 223, hex: '#FFDFDF' },
  { code: '956', name: 'Neon Pink', r: 255, g: 110, b: 139, hex: '#FF6E8B' },

  // Oranges
  { code: '970', name: 'Light Orange', r: 246, g: 108, b: 23, hex: '#F66C17' },
  { code: '740', name: 'Tangerine', r: 255, g: 139, b: 0, hex: '#FF8B00' },
  { code: '606', name: 'Bright Orange-Red', r: 250, g: 49, b: 2, hex: '#FA3102' },
  { code: '972', name: 'Canary Deep', r: 255, g: 181, b: 21, hex: '#FFB515' },

  // Yellows
  { code: '307', name: 'Lemon', r: 247, g: 227, b: 73, hex: '#F7E349' },
  { code: '444', name: 'Lemon Dark', r: 244, g: 214, b: 0, hex: '#F4D600' },
  { code: '743', name: 'Medium Yellow', r: 252, g: 210, b: 104, hex: '#FCD268' },
  { code: '745', name: 'Pale Yellow', r: 254, g: 238, b: 181, hex: '#FEEEB5' },

  // Greens
  { code: '934', name: 'Avocado Green Black', r: 49, g: 57, b: 25, hex: '#313919' },
  { code: '702', name: 'Kelly Green', r: 71, g: 161, b: 79, hex: '#47A14F' },
  { code: '700', name: 'Bright Green', r: 3, g: 122, b: 52, hex: '#037A34' },
  { code: '699', name: 'Green Dark', r: 11, g: 99, b: 46, hex: '#0B632E' },
  { code: '907', name: 'Parrot Green Light', r: 193, g: 219, b: 84, hex: '#C1DB54' },
  { code: '912', name: 'Emerald Green Light', r: 127, g: 201, b: 160, hex: '#7FC9A0' },
  { code: '3818', name: 'Emerald Green Ultra Dark', r: 16, g: 84, b: 56, hex: '#105438' },
  { code: '987', name: 'Forest Green Dark', r: 84, g: 118, b: 78, hex: '#54764E' },

  // Blues
  { code: '796', name: 'Royal Blue Dark', r: 17, g: 58, b: 120, hex: '#113A78' },
  { code: '798', name: 'Delft Blue Dark', r: 70, g: 104, b: 156, hex: '#46689C' },
  { code: '809', name: 'Delft Blue Light', r: 161, g: 185, b: 219, hex: '#A1B9DB' },
  { code: '820', name: 'Royal Blue Very Dark', r: 10, g: 33, b: 79, hex: '#0A214F' },
  { code: '995', name: 'Electric Blue Dark', r: 0, g: 134, b: 191, hex: '#0086BF' },
  { code: '996', name: 'Electric Blue Medium', r: 61, g: 190, b: 235, hex: '#3DBEEB' },
  { code: '3843', name: 'Electric Blue Light', r: 18, g: 161, b: 211, hex: '#12A1D3' },
  { code: '312', name: 'Baby Blue Very Dark', r: 35, g: 73, b: 118, hex: '#234976' },

  // Purples/Violets
  { code: '550', name: 'Violet Very Dark', r: 92, g: 16, b: 97, hex: '#5C1061' },
  { code: '552', name: 'Violet Medium', r: 134, g: 57, b: 139, hex: '#86398B' },
  { code: '554', name: 'Violet Light', r: 219, g: 172, b: 214, hex: '#DBACD6' },
  { code: '333', name: 'Blue Violet Very Dark', r: 91, g: 74, b: 126, hex: '#5B4A7E' },
  { code: '3837', name: 'Lavender Ultra Dark', r: 138, g: 55, b: 132, hex: '#8A3784' },

  // Browns/Beiges/Tans
  { code: '433', name: 'Brown Medium', r: 113, g: 68, b: 35, hex: '#714423' },
  { code: '435', name: 'Brown Very Light', r: 177, g: 119, b: 72, hex: '#B17748' },
  { code: '437', name: 'Tan Light', r: 228, g: 185, b: 139, hex: '#E4B98B' },
  { code: '898', name: 'Coffee Brown Very Dark', r: 73, g: 43, b: 18, hex: '#492B12' },
  { code: '938', name: 'Coffee Brown Ultra Dark', r: 54, g: 30, b: 10, hex: '#361E0A' },
  { code: '738', name: 'Tan Very Light', r: 235, g: 209, b: 176, hex: '#EBD1B0' },
  
  // Teals/Turquoise
  { code: '3847', name: 'Teal Green Dark', r: 0, g: 102, b: 95, hex: '#00665F' },
  { code: '3849', name: 'Teal Green Light', r: 84, g: 177, b: 169, hex: '#54B1A9' },
  { code: '959', name: 'Sea Green Medium Light', r: 113, g: 218, b: 201, hex: '#71DAC9' },
  { code: '3812', name: 'Verdigris Very Dark', r: 0, g: 131, b: 125, hex: '#00837D' },
  
  // Custom Peach
  { code: '754', name: 'Peach', r: 252, g: 213, b: 200, hex: '#FCD5C8' },

  // New Fixed Palette Additions
  { code: '976', name: 'Golden Brown', r: 198, g: 124, b: 67, hex: '#C67C43' },
  { code: '3840', name: 'Light Blue', r: 170, g: 194, b: 226, hex: '#AAC2E2' },
  { code: '3756', name: 'Baby Blue', r: 238, g: 243, b: 245, hex: '#EEF3F5' },
  { code: '640', name: 'Khaki Gray', r: 134, g: 124, b: 109, hex: '#867C6D' },
  { code: '3864', name: 'Light Skin', r: 225, g: 205, b: 188, hex: '#E1CDBD' },
  { code: '3862', name: 'Medium Skin', r: 138, g: 104, b: 84, hex: '#8A6854' },
  { code: '414', name: 'Steel Gray Dark', r: 140, g: 140, b: 140, hex: '#8C8C8C' },
  { code: '3846', name: 'Bright Turquoise Light', r: 6, g: 227, b: 230, hex: '#06E3E6' },
  { code: '973', name: 'Canary Bright', r: 255, g: 227, b: 0, hex: '#FFE300' },
  { code: '950', name: 'Desert Sand Light', r: 238, g: 211, b: 196, hex: '#EED3C4' },
  { code: 'WHITE', name: 'White', r: 255, g: 255, b: 255, hex: '#FFFFFF' },
];

// Helper to get nearest DMC color using Euclidean distance in RGB space
export function getNearestDMCColor(r: number, g: number, b: number, customList?: DMCColor[]): DMCColor {
  const list = customList && customList.length > 0 ? customList : DMC_COLORS;
  let minDistance = Infinity;
  let nearestColor = list[0];

  for (const color of list) {
    const dr = r - color.r;
    const dg = g - color.g;
    const db = b - color.b;
    const distance = dr * dr + dg * dg + db * db;

    if (distance < minDistance) {
      minDistance = distance;
      nearestColor = color;
    }
  }

  return nearestColor;
}
