const { withPodfile, withSettingsGradle } = require('expo/config-plugins');
const services = require('../src/frontend/appShell/observability/reportingServices.json');

// Native packages only a development build needs. A release compiles every autolinked module,
// so keeping them costs build time and APK size without adding a reachable feature: the
// developer menu has no entry point there, and Storybook's controls stay disabled.
const DEV_ONLY_PACKAGES = [
  '@react-native-community/datetimepicker',
  '@react-native-community/slider',
  'expo-dev-client',
  'expo-dev-launcher',
  'expo-dev-menu',
];

// Marking generated lines lets a later prebuild recognize and replace its own output. The
// selection is a policy decision, so only the managed template call (or our own previous
// output) is rewritten; a custom call fails the prebuild instead of being guessed at.
const MARKER = 'cherry-autolinking';

module.exports = (config) => {
  const reporting = config.extra?.reporting;
  const isProduction =
    reporting?.environment === 'production' && process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true';
  const excluded = [
    ...Object.entries(services)
      .filter(
        ([name, service]) =>
          service.nativePackage &&
          !(isProduction && service.enabled && reporting?.services?.[name] === true),
      )
      .map(([, service]) => service.nativePackage),
    ...(isProduction ? DEV_ONLY_PACKAGES : []),
  ];

  config = withPodfile(config, (mod) => {
    const call = new RegExp(
      `^([\\t ]*)use_expo_modules!(?:\\(exclude: \\[[^\\n]*\\]\\) # ${MARKER})?[\\t ]*$`,
      'm',
    );
    if (!call.test(mod.modResults.contents)) {
      throw new Error('Autolinking exclusions require the managed use_expo_modules! Podfile call.');
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      call,
      (_, indent) =>
        `${indent}use_expo_modules!${excluded.length ? `(exclude: ${JSON.stringify(excluded)}) # ${MARKER}` : ''}`,
    );
    return mod;
  });

  return withSettingsGradle(config, (mod) => {
    const call = new RegExp(
      `^(?:[\\t ]*expoAutolinking\\.exclude = [^\\n]* // ${MARKER}\\n)?([\\t ]*)expoAutolinking\\.useExpoModules\\(\\)[\\t ]*$`,
      'm',
    );
    if (mod.modResults.language !== 'groovy' || !call.test(mod.modResults.contents)) {
      throw new Error(
        'Autolinking exclusions require the managed expoAutolinking.useExpoModules() Gradle call.',
      );
    }
    mod.modResults.contents = mod.modResults.contents.replace(call, (_, indent) => {
      const exclusion = excluded.length
        ? `${indent}expoAutolinking.exclude = (expoAutolinking.exclude ?: []) + ${JSON.stringify(excluded)} // ${MARKER}\n`
        : '';
      return `${exclusion}${indent}expoAutolinking.useExpoModules()`;
    });
    return mod;
  });
};
