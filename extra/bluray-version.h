#ifndef BLURAY_VERSION_H_
#define BLURAY_VERSION_H_

/** Pack version number to single integer */
#define BLURAY_VERSION_CODE(major, minor, micro) \
    (((major) * 10000) +                         \
     ((minor) *   100) +                         \
     ((micro) *     1))

#ifndef BLURAY_VERSION_MAJOR
#define BLURAY_VERSION_MAJOR 999
#define BLURAY_VERSION_MINOR 0
#define BLURAY_VERSION_MICRO 0
#endif

/** libbluray version number as a string */
#define BLURAY_VERSION_STRING_E2(a,b,c) #a #b #c
#define BLURAY_VERSION_STRING_E1(a,b,c) BLURAY_VERSION_STRING_E2(a,b,c)
#define BLURAY_VERSION_STRING BLURAY_VERSION_STRING_E1(BLURAY_VERSION_MAJOR, BLURAY_VERSION_MINOR, BLURAY_VERSION_MICRO)

/** libbluray version number as a single integer */
#define BLURAY_VERSION \
    BLURAY_VERSION_CODE(BLURAY_VERSION_MAJOR, BLURAY_VERSION_MINOR, BLURAY_VERSION_MICRO)

#endif /* BLURAY_VERSION_H_ */
