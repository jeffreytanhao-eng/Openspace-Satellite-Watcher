export const EARTH_RADIUS_KM = 6378.137;

export const GM = 398600.4418;

export const TLE_LINE1_REGEX = /^1 (\d{5})U (\d{2})(\d{3})\.(\d{8}) (\.\d{8}) ([+-]\d{5}) ([+-]\d{5}) (\d{4}) (\d{2})(\d{3}) (\d{2})(\d{7}) (\d)$/;

export const TLE_LINE2_REGEX = /^2 (\d{5}) (\d{2})\.(\d{8}) (\d{2})\.(\d{8}) (\d{7}) (\d{2})\.(\d{8}) (\d{2})\.(\d{8}) (\d{2})(\d{5}) (\d)$/;

export const TLE_NAME_REGEX = /^[A-Z0-9 ]{1,24}$/;