/* Panel adapter. Upstream Bedrock generator: vendor/cubiomes-bedrock (MIT). */
#include "generator.h"
#include "finders.h"
#include "util.h"
#include <math.h>

static Generator g;
static unsigned char colors[256][3];
static int result[4];
static const int versions[] = { MC_1_18, MC_1_19, MC_1_20, MC_1_21, MC_1_21_50, MC_1_21_60 };

int init(int version, int dim, uint64_t seed) {
    if (version < 0 || version >= 6 || dim < -1 || dim > 1) return 0;
    setupGenerator(&g, versions[version], 0);
    applySeed(&g, dim, seed);
    initBiomeColors(colors);
    return 1;
}
int biome(int x, int y, int z) { return getBiomeAt(&g, 4, (int)floor(x / 4.0), (int)floor(y / 4.0), (int)floor(z / 4.0)); }
int color(int id) { return id < 0 || id > 255 ? 0x333333 : (colors[id][0] << 16) | (colors[id][1] << 8) | colors[id][2]; }
const char *name(int id) { return biome2str(g.mc, id); }
int region(int type) {
    StructureConfig c;
    if (!getStructureConfig(type, g.mc, &c) || c.dim != g.dim) return 0;
    return c.regionSize * 16;
}
int *structure(int type, int rx, int rz) {
    Pos p; result[0] = 0;
    if (!region(type) || !getStructurePos(type, g.mc, g.seed, rx, rz, &p)) return result;
    if (!isViableStructurePos(type, &g, p.x, p.z, 0)) return result;
    result[0] = 1; result[1] = p.x; result[2] = p.z;
    return result;
}
