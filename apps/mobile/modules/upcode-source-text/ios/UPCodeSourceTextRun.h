// This guard prevent this file to be compiled in the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTComponent.h>
#import <React/RCTViewComponentView.h>
#import <UIKit/UIKit.h>

#ifndef UPCodeSourceTextRunNativeComponent_h
#define UPCodeSourceTextRunNativeComponent_h

NS_ASSUME_NONNULL_BEGIN

@interface UPCodeSourceTextRun : RCTViewComponentView

@property(nonatomic, copy, nullable) NSString *text;
@end

NS_ASSUME_NONNULL_END

#endif /* UitextviewViewNativeComponent_h */
#endif /* RCT_NEW_ARCH_ENABLED */
