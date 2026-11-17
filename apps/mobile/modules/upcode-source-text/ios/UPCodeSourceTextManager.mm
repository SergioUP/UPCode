#import <React/RCTUIManager.h>
#import <React/RCTViewManager.h>

@interface UPCodeSourceTextManager : RCTViewManager
@end

@implementation UPCodeSourceTextManager

RCT_EXPORT_MODULE(UPCodeSourceText)

- (UIView *)view {
  return [[UIView alloc] init];
}

@end

@interface UPCodeSourceTextRunManager : RCTViewManager
@end

@implementation UPCodeSourceTextRunManager

RCT_EXPORT_MODULE(UPCodeSourceTextRun)

- (UIView *)view {
  return nil;
}

@end
