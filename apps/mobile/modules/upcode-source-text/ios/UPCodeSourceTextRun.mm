#import "UPCodeSourceTextRun.h"
#import <React/RCTFabricComponentsPlugins.h>
#import "UPCodeSourceTextRunComponentDescriptor.h"
#import <react/renderer/components/UPCodeSourceTextSpec/Props.h>
#import <react/renderer/components/UPCodeSourceTextSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface UPCodeSourceTextRun () <RCTT3SourceTextRunViewProtocol>

@end

@implementation UPCodeSourceTextRun {
  NSString *_text;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<
      UPCodeSourceTextRunComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps =
        std::make_shared<const UPCodeSourceTextRunProps>();
    _props = defaultProps;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props
           oldProps:(Props::Shared const &)oldProps {
  const auto &oldViewProps =
      *std::static_pointer_cast<UPCodeSourceTextRunProps const>(_props);
  const auto &newViewProps =
      *std::static_pointer_cast<UPCodeSourceTextRunProps const>(props);

  if (newViewProps.text != oldViewProps.text) {
    NSString *text = [NSString stringWithUTF8String:newViewProps.text.c_str()];
    _text = text;
  }

  [super updateProps:props oldProps:oldProps];
}

+ (BOOL)shouldBeRecycled {
  return NO;
}

Class<RCTComponentViewProtocol> UPCodeSourceTextRunCls(void) {
  return UPCodeSourceTextRun.class;
}

@end
