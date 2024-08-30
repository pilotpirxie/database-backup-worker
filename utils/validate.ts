export const validate = (toValidate: (string | undefined)[]): boolean => {
  for (let i = 0; i < toValidate.length; i++) {
    if (!toValidate[i]) {
      return false;
    }
  }

  return true;
};
